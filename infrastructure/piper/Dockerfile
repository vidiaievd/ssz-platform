# Piper neural TTS, exposed over HTTP for the whole platform.
#
# Its own container rather than a binary inside media-service: the model is
# loaded once at start-up and answers every request from memory. The CLI
# reloads the model per invocation, which for one-word pronunciations costs
# more than the synthesis itself.
FROM python:3.12-slim

ARG PIPER_VERSION=1.6.0
# Norwegian is published as `no_NO`, not `nb_NO` — the voice covers Bokmål.
ARG VOICE=no_NO-talesyntese-medium
ARG VOICE_PATH=no/no_NO/talesyntese/medium

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# The `http` extra, not the bare package: `piper.http_server` imports Flask,
# which the default install does not pull in.
RUN pip install --no-cache-dir "piper-tts[http]==${PIPER_VERSION}"

ENV PIPER_DATA_DIR=/voices
ENV PIPER_VOICE=${VOICE}

# Baked into the image, not downloaded at start-up: a container that cannot
# reach HuggingFace must still come up with a working voice.
RUN mkdir -p ${PIPER_DATA_DIR} \
    && curl -fsSL -o ${PIPER_DATA_DIR}/${VOICE}.onnx \
       "https://huggingface.co/rhasspy/piper-voices/resolve/main/${VOICE_PATH}/${VOICE}.onnx" \
    && curl -fsSL -o ${PIPER_DATA_DIR}/${VOICE}.onnx.json \
       "https://huggingface.co/rhasspy/piper-voices/resolve/main/${VOICE_PATH}/${VOICE}.onnx.json"

EXPOSE 5000

CMD ["sh", "-c", "python3 -m piper.http_server -m ${PIPER_VOICE} --data-dir ${PIPER_DATA_DIR} --host 0.0.0.0 --port 5000"]
