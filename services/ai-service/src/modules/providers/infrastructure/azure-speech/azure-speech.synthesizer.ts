import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LlmError } from '../../domain/llm-error.js';
import type { TtsModelRef } from '../../domain/model-features.js';
import type { SpeechSynthesizer } from '../../domain/speech-synthesizer.port.js';
import { billedCharacters, voiceOf, type SynthesisRequest } from '../../domain/synthesis-request.js';
import type { SynthesisResult } from '../../domain/synthesis-result.js';
import { readWav } from '../../domain/wav.js';
import { readCredential } from '../credentials.js';
import { fromFetchFailure, fromStatus } from './azure-errors.js';

/** Course language → Azure locale. */
const AZURE_LOCALE: Record<string, string> = { nb: 'nb-NO', en: 'en-US' };

/** The format the speech models take as it is (media's `speech` variant): PCM 16-bit, 16 kHz, mono, in RIFF. */
const OUTPUT_FORMAT = 'riff-16khz-16bit-mono-pcm';

const LABEL = 'Azure TTS';

/**
 * Azure AI Speech text to speech (plan 88, step 6b, Q10) — reference clips of a word in a
 * carrier sentence, whose tonemes are checked before a clip is kept (§0.5: Pernille, Finn and
 * Iselin carry tonemes as a native speaker does in 12 of 14 pairs).
 *
 * `POST {baseUrl}/cognitiveservices/v1`, SSML as the body, the key in
 * `Ocp-Apim-Subscription-Key`. `baseUrl` is the resource's synthesis endpoint
 * (`https://<region>.tts.speech.microsoft.com`) — not the recognition one, so synthesis is a
 * provider row of its own with the same kind and key. The answer is a WAV in the format the
 * recognizers take, so a clip can be assessed back by `AzureSpeechAssessor` without converting.
 */
@Injectable()
export class AzureSpeechSynthesizer implements SpeechSynthesizer {
  readonly kind = 'azure_speech' as const;

  async synthesize(request: SynthesisRequest, model: TtsModelRef): Promise<SynthesisResult> {
    const key = readCredential(model.provider);
    if (!key) throw new LlmError('auth', `Provider "${model.provider.code}" is not configured: no credentialRef`);
    const baseUrl = model.provider.baseUrl;
    if (!baseUrl) {
      throw new LlmError('auth', `Provider "${model.provider.code}" is not configured: baseUrl is not set`);
    }
    const locale = AZURE_LOCALE[request.language];
    const voice = locale ? voiceOf(model.features, request.language, request.voice) : null;
    if (!locale || !voice) {
      throw new LlmError(
        'invalid_request',
        `${LABEL}: no voice ${request.voice ?? '(default)'} for language "${request.language}"`,
      );
    }
    const characters = billedCharacters(request.text);
    if (request.text.trim() === '') throw new LlmError('invalid_request', `${LABEL}: nothing to say`);
    if (characters > model.features.maxCharacters) {
      throw new LlmError('invalid_request', `${LABEL}: text is longer than ${model.features.maxCharacters} characters`);
    }

    const url = new URL('cognitiveservices/v1', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const requestId = randomUUID();
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          'User-Agent': 'ssz-ai-service',
          'X-ClientRequestId': requestId,
        },
        body: ssmlOf(request.text, locale, voice),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (err) {
      throw fromFetchFailure(err, LABEL);
    }
    if (!response.ok) throw await fromStatus(response, LABEL);

    let data: Uint8Array;
    try {
      data = new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      throw fromFetchFailure(err, LABEL);
    }
    const wav = readWav(data);
    if (!wav || wav.samples.length === 0) throw new LlmError('unknown', `${LABEL}: the answer is not a WAV recording`);

    return {
      audio: { format: 'wav', data },
      audioMs: Math.round((wav.samples.length * 1000) / wav.byteRate),
      voice,
      characters,
      providerRequestId: response.headers.get('x-requestid') ?? response.headers.get('apim-request-id') ?? requestId,
      latencyMs: Date.now() - started,
    };
  }
}

/** The text as SSML: one voice, the text escaped — never markup of the caller's. Exported for tests. */
export function ssmlOf(text: string, locale: string, voice: string): string {
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
    `<voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
