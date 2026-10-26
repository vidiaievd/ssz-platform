# NB-Whisper speech recognition, exposed over HTTP to ai-service (plan 82, step 4).
#
# Its own container, like piper-tts: the model is loaded once at start-up and answers every
# request from memory. Only ai-service calls it, as the keyless provider `whisper_local` —
# the learner's recordings never leave the platform for the base tier.
#
# NB-Whisper is the National Library of Norway's fine-tune of Whisper. Its HuggingFace repos
# carry a CTranslate2 export at the root (`model.bin` + `config.json` + `vocabulary.json`),
# which faster-whisper loads as it is — no conversion, no torch in the image.
FROM python:3.12-slim

# `tiny` | `base` | `small` | `medium` | `large`, each with a `-verbatim` twin. Verbatim is
# trained to write down what was said rather than what was meant — hesitations, repeats and
# misreadings stay in the transcript, which is what a reading check needs. Fp32 sizes:
# base 0.3 GB, small 1 GB, medium 3 GB, large 6 GB; int8 on CPU takes about a quarter in RAM.
ARG MODEL=nb-whisper-small-verbatim

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ENV WHISPER_MODEL_DIR=/model
ENV WHISPER_MODEL=${MODEL}

# Baked into the image, not downloaded at start-up: a container that cannot reach
# HuggingFace must still come up with a working model. `tokenizer.json` and
# `preprocessor_config.json` are needed too — without them faster-whisper fetches a stock
# tokenizer from the hub at load time.
RUN mkdir -p ${WHISPER_MODEL_DIR} \
    && for f in model.bin config.json vocabulary.json tokenizer.json preprocessor_config.json; do \
         python3 -c "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])" \
           "https://huggingface.co/NbAiLab/${MODEL}/resolve/main/$f" "${WHISPER_MODEL_DIR}/$f" || exit 1; \
       done

COPY server.py /app/server.py

# CPU only. int8 quantizes the fp32 weights on load: ~4x less memory, a little accuracy.
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8
ENV WHISPER_CPU_THREADS=4
# Recordings waiting behind the one being transcribed; one more is answered 503.
ENV WHISPER_MAX_QUEUE=4
ENV HF_HUB_OFFLINE=1

EXPOSE 8000

CMD ["python3", "/app/server.py"]
