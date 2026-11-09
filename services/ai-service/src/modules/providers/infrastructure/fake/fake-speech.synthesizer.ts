import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LlmError } from '../../domain/llm-error.js';
import type { TtsModelRef } from '../../domain/model-features.js';
import type { SpeechSynthesizer } from '../../domain/speech-synthesizer.port.js';
import { billedCharacters, voiceOf, type SynthesisRequest } from '../../domain/synthesis-request.js';
import type { SynthesisResult } from '../../domain/synthesis-result.js';

const MARKER = /@fake:([a-z_]+)/;

/** A steady talker: 70 ms a character, at least half a second. */
const MS_PER_CHARACTER = 70;
const MIN_MS = 500;
const SAMPLE_RATE = 16_000;

/**
 * A synthesizer that never leaves the process (plan 88, step 6b) — for unit tests and for dev
 * without an Azure key. It speaks a 200 Hz tone as long as the text would take, in the format
 * the real one answers with. A `@fake:<code>` marker in the text raises the `LlmError` of that
 * code (`timeout`, `rate_limited`, `unavailable`, `auth`, `invalid_request`); what a real
 * provider would refuse — an unknown voice or language, a text over the limit — it refuses too.
 */
@Injectable()
export class FakeSpeechSynthesizer implements SpeechSynthesizer {
  readonly kind = 'fake' as const;

  async synthesize(request: SynthesisRequest, model: TtsModelRef): Promise<SynthesisResult> {
    const started = Date.now();
    const failure = MARKER.exec(request.text)?.[1];
    if (failure) throw failureOf(failure);

    const voice = voiceOf(model.features, request.language, request.voice);
    if (!voice)
      throw new LlmError('invalid_request', `fake: no voice ${request.voice ?? '(default)'} for "${request.language}"`);
    const characters = billedCharacters(request.text);
    if (characters > model.features.maxCharacters) {
      throw new LlmError('invalid_request', `fake: text is longer than ${model.features.maxCharacters} characters`);
    }

    const audioMs = Math.max(MIN_MS, characters * MS_PER_CHARACTER);
    return {
      audio: { format: 'wav', data: toneWav(audioMs) },
      audioMs,
      voice,
      characters,
      providerRequestId: `fake_${randomUUID()}`,
      latencyMs: Date.now() - started,
    };
  }
}

function failureOf(code: string): LlmError {
  switch (code) {
    case 'timeout':
      return new LlmError('timeout', 'fake: synthesis timed out');
    case 'rate_limited':
      return new LlmError('rate_limited', 'fake: rate limited', { retryAfterMs: 1000 });
    case 'unavailable':
      return new LlmError('unavailable', 'fake: provider unavailable');
    case 'auth':
      return new LlmError('auth', 'fake: invalid credentials');
    case 'invalid_request':
      return new LlmError('invalid_request', 'fake: invalid request');
    default:
      throw new Error(`Unknown fake synthesis scenario "${code}"`);
  }
}

/** PCM 16-bit, 16 kHz, mono: a 200 Hz tone at a quarter of full scale. */
function toneWav(durationMs: number): Uint8Array {
  const samples = Math.round((durationMs * SAMPLE_RATE) / 1000);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(8191 * Math.sin((2 * Math.PI * 200 * i) / SAMPLE_RATE)), true);
  }
  return bytes;
}
