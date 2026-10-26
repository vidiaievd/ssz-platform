import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { lexicalWord } from '../../domain/lexical.js';
import { LlmError } from '../../domain/llm-error.js';
import type { SpeechModelRef } from '../../domain/model-features.js';
import type { SpeechAssessor } from '../../domain/speech-assessor.port.js';
import type { SpeechRequest } from '../../domain/speech-request.js';
import type { HeardWord, SpeechResult } from '../../domain/speech-result.js';
import { wavDurationMs } from '../../domain/wav.js';

/** Course language → Whisper's language code. Whisper calls Bokmål `no`; NB-Whisper is trained so. */
const WHISPER_LANGUAGE: Record<string, string> = { nb: 'no', nn: 'nn', en: 'en' };

/** What the sidecar answers (`infrastructure/whisper/server.py`). */
interface SidecarTranscript {
  text: string;
  words: Array<{ text: string; startMs: number; endMs: number; probability: number }>;
  durationMs: number;
}

/**
 * The self-hosted NB-Whisper sidecar (plan 82, step 4) — `POST {baseUrl}/v1/transcribe`, the
 * WAV as the body. Keyless: the sidecar sits on the platform network and only ai-service
 * reaches it.
 *
 * Only the audio, the model and the language go out. The reference text stays here: a
 * recognizer primed with the passage hears the passage (see `SpeechRequest.referenceText`).
 * Whisper has no pronunciation scores, so `pronunciation` is always null.
 *
 * The sidecar's words carry punctuation and case (`Bergen.`); they come back in lexical form,
 * and a word that was only punctuation is dropped.
 */
@Injectable()
export class WhisperLocalSpeechAssessor implements SpeechAssessor {
  readonly kind = 'whisper_local' as const;

  async assess(request: SpeechRequest, model: SpeechModelRef): Promise<SpeechResult> {
    const baseUrl = model.provider.baseUrl;
    if (!baseUrl) {
      throw new LlmError('auth', `Provider "${model.provider.code}" is not configured: baseUrl is not set`);
    }
    const durationMs = wavDurationMs(request.audio.data);
    if (durationMs === null) throw new LlmError('invalid_request', 'Whisper: audio is not a WAV recording');
    if (durationMs > model.features.maxAudioSeconds * 1000) {
      throw new LlmError('invalid_request', `Whisper: audio is longer than ${model.features.maxAudioSeconds} s`);
    }
    const language = WHISPER_LANGUAGE[request.language];
    if (!language || !model.features.languages.includes(request.language)) {
      throw new LlmError('invalid_request', `Whisper: language "${request.language}" is not supported`);
    }

    const url = new URL('v1/transcribe', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('model', model.providerModelId);
    url.searchParams.set('language', language);
    const requestId = randomUUID();

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav', 'X-Request-Id': requestId },
        // Recordings are read into plain ArrayBuffers, never shared memory.
        body: request.audio.data as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (err) {
      throw fromFetchFailure(err);
    }
    if (!response.ok) throw await fromStatus(response);

    let body: SidecarTranscript;
    try {
      body = (await response.json()) as SidecarTranscript;
    } catch (err) {
      throw fromFetchFailure(err);
    }
    if (!Array.isArray(body?.words)) throw new LlmError('unknown', 'Whisper: answer has no words');

    const words: HeardWord[] = body.words.flatMap((w) => {
      const text = lexicalWord(w.text);
      return text ? [{ text, startMs: w.startMs, endMs: w.endMs, confidence: w.probability ?? null }] : [];
    });
    return {
      transcript: words.map((w) => w.text).join(' '),
      words,
      pronunciation: null,
      // What we sent, as the header says — the same length the fake bills, whatever the
      // decoder on the other side rounds to.
      audioMs: durationMs,
      providerRequestId: response.headers.get('x-request-id') ?? requestId,
      latencyMs: Date.now() - started,
    };
  }
}

/** The call never got an answer: our timeout, or the sidecar is down / not deployed. */
function fromFetchFailure(err: unknown): LlmError {
  // Not `instanceof Error`: the timeout is a DOMException, which may come from another realm.
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new LlmError('timeout', 'Whisper: request timed out', { cause: err });
  }
  const detail = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
  return new LlmError('unavailable', `Whisper: connection failed — ${detail}`, { cause: err });
}

async function fromStatus(response: Response): Promise<LlmError> {
  const status = response.status;
  const detail = await response.text().catch(() => '');
  const message = `Whisper ${status}: ${detail.slice(0, 300)}`;
  // Its line is full: wait and retry, or let the fallback model take it.
  if (status === 503) return new LlmError('overloaded', message, { retryAfterMs: retryAfterMs(response.headers) });
  if ([400, 413, 415, 422].includes(status)) return new LlmError('invalid_request', message);
  // The image carries another model than the registry names, or the URL is wrong: this
  // provider cannot serve the call, another one may.
  if (status === 404) return new LlmError('unavailable', message);
  if (status >= 500) return new LlmError('unavailable', message);
  return new LlmError('unknown', message);
}

function retryAfterMs(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
