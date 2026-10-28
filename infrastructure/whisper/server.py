"""NB-Whisper over HTTP for ai-service (plan 82, step 4).

Two routes, nothing else:

  GET  /health                         -> 200 {"status": "ok", "model": ...} once the model is loaded
  POST /v1/transcribe?model=&language= -> the words heard in the recording (raw audio body)

The standard library serves it: one internal caller, one route that matters, and every
second of a request is spent inside the model, not in the framework.

The recognizer is never primed with the passage the learner was asked to read (no
`initial_prompt`): biased toward the passage, it hears the passage, and a misread word comes
back as read. The reading check in the engine depends on hearing what was actually said.
"""

import io
import json
import logging
import os
import threading
import time
import uuid
import wave
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
from faster_whisper import WhisperModel

MODEL_NAME = os.environ.get("WHISPER_MODEL", "nb-whisper-small-verbatim")
MODEL_DIR = os.environ.get("WHISPER_MODEL_DIR", "/model")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "4"))
MAX_QUEUE = int(os.environ.get("WHISPER_MAX_QUEUE", "4"))
# A 2-minute 16 kHz mono PCM WAV is under 4 MB; anything far bigger is not a recording we sent.
MAX_BODY_BYTES = int(os.environ.get("WHISPER_MAX_BODY_BYTES", str(16 * 1024 * 1024)))
PORT = int(os.environ.get("PORT", "8000"))

# Whisper's own language codes. Bokmål is `no` in Whisper; NB-Whisper is trained that way.
LANGUAGES = {"no", "nn", "en"}

# Whisper's rule for a segment that is silence or noise rather than speech: likely no speech
# and not confident about the text. VAD removes most such stretches before decoding; this
# catches the hallucinated line that slips through ("Teksting av ..." over a silent tail).
NO_SPEECH_PROB = 0.6
LOW_LOGPROB = -1.0

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper")

log.info("loading %s from %s (%s, %s, %d threads)", MODEL_NAME, MODEL_DIR, DEVICE, COMPUTE_TYPE, CPU_THREADS)
model = WhisperModel(MODEL_DIR, device=DEVICE, compute_type=COMPUTE_TYPE, cpu_threads=CPU_THREADS)
log.info("model loaded")

# One transcription at a time — on CPU two in parallel only split the same cores — and a
# bounded line behind it: past that the caller hears 503 and its router falls back.
slots = threading.BoundedSemaphore(MAX_QUEUE + 1)
model_lock = threading.Lock()


class InvalidAudio(ValueError):
    pass


def decode_wav(audio: bytes) -> np.ndarray:
    """PCM 16-bit, 16 kHz, mono WAV -> float32 samples, the array Whisper takes as it is.

    Decoded here rather than by faster-whisper's PyAV path: the input format is fixed (media's
    `speech` variant), and PyAV's API moves under faster-whisper (`av.open(metadata_errors=)`
    is gone in PyAV 16+, while faster-whisper 1.2.1 still passes it).
    """
    try:
        with wave.open(io.BytesIO(audio), "rb") as wav:
            channels, width, rate = wav.getnchannels(), wav.getsampwidth(), wav.getframerate()
            frames = wav.readframes(wav.getnframes())
    except (wave.Error, EOFError) as err:
        raise InvalidAudio(f"not a PCM WAV recording: {err}") from err
    if (channels, width, rate) != (1, 2, 16000):
        raise InvalidAudio(f"expected 16 kHz mono 16-bit PCM, got {rate} Hz, {channels} channel(s), {width * 8}-bit")
    return np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0


def transcribe(audio: bytes, language: str) -> dict:
    segments, info = model.transcribe(
        decode_wav(audio),
        language=language,
        task="transcribe",
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
        # Each segment decoded on its own: a misheard line is not carried into the next one.
        condition_on_previous_text=False,
    )
    words = []
    for segment in segments:  # a generator: decoding happens here
        if segment.no_speech_prob > NO_SPEECH_PROB and segment.avg_logprob < LOW_LOGPROB:
            continue
        for w in segment.words or []:
            text = w.word.strip()
            if not text:
                continue
            words.append(
                {
                    "text": text,
                    "startMs": round(w.start * 1000),
                    "endMs": round(w.end * 1000),
                    "probability": round(w.probability, 4),
                }
            )
    return {
        "text": " ".join(w["text"] for w in words),
        "words": words,
        "durationMs": round(info.duration * 1000),
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        if urlparse(self.path).path == "/health":
            self.reply(HTTPStatus.OK, {"status": "ok", "model": MODEL_NAME})
        else:
            self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        url = urlparse(self.path)
        if url.path != "/v1/transcribe":
            self.reply(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        query = parse_qs(url.query)
        requested = query.get("model", [MODEL_NAME])[0]
        language = query.get("language", [""])[0]
        request_id = self.headers.get("X-Request-Id") or str(uuid.uuid4())

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            # Not read: the connection is closed instead of draining megabytes we refuse.
            self.close_connection = True
            self.reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "too_large"}, request_id)
            return
        audio = self.rfile.read(length)

        if requested != MODEL_NAME:
            # A deployment mismatch (registry names a model this image does not carry), not a
            # bad request: another model may well serve it.
            self.reply(HTTPStatus.NOT_FOUND, {"error": "model_not_loaded", "loaded": MODEL_NAME}, request_id)
            return
        if language not in LANGUAGES:
            self.reply(HTTPStatus.BAD_REQUEST, {"error": "unsupported_language", "language": language}, request_id)
            return
        if not audio:
            self.reply(HTTPStatus.BAD_REQUEST, {"error": "empty_audio"}, request_id)
            return

        if not slots.acquire(blocking=False):
            self.reply(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "busy"}, request_id, {"Retry-After": "2"})
            return
        try:
            started = time.monotonic()
            with model_lock:
                try:
                    result = transcribe(audio, language)
                except InvalidAudio as err:
                    self.reply(HTTPStatus.BAD_REQUEST, {"error": "invalid_audio", "detail": str(err)}, request_id)
                    return
            result["latencyMs"] = round((time.monotonic() - started) * 1000)
            result["model"] = MODEL_NAME
            result["language"] = language
            log.info(
                "%s %s: %d ms of audio, %d words, %d ms",
                request_id,
                language,
                result["durationMs"],
                len(result["words"]),
                result["latencyMs"],
            )
            self.reply(HTTPStatus.OK, result, request_id)
        except Exception:
            log.exception("%s transcription failed", request_id)
            self.reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal"}, request_id)
        finally:
            slots.release()

    def reply(self, status: HTTPStatus, body: dict, request_id: str | None = None, headers: dict | None = None) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if request_id:
            self.send_header("X-Request-Id", request_id)
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args) -> None:
        # The health probe every 15 s would drown the log; transcriptions are logged above.
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.daemon_threads = True
    log.info("listening on :%d", PORT)
    server.serve_forever()
