import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LlmError } from '../../domain/llm-error.js';
import type { SpeechModelRef } from '../../domain/model-features.js';
import type { SpeechAssessor } from '../../domain/speech-assessor.port.js';
import type { SpeechRequest } from '../../domain/speech-request.js';
import type { HeardWord, PronunciationScores, SpeechResult } from '../../domain/speech-result.js';
import { wavDurationMs } from '../../domain/wav.js';

export const FAKE_SPEECH_SCENARIOS = [
  'ok',
  'perfect',
  'misses',
  'silence',
  'timeout',
  'rate_limited',
  'overloaded',
  'auth',
  'invalid_request',
  'unavailable',
] as const;

export type FakeSpeechScenario = (typeof FAKE_SPEECH_SCENARIOS)[number];

const MARKER = /@fake:([a-z_]+)/;

/** Every Nth word of the reference is not heard: `ok` still passes at 85 %, `misses` does not. */
const MISS_EVERY: Partial<Record<FakeSpeechScenario, number>> = { ok: 8, misses: 3 };

/** A steady reader: a pause before the first word, then a word every 500 ms. */
const LEAD_MS = 300;
const WORD_MS = 450;
const GAP_MS = 50;

/**
 * A speech model that never leaves the process (plan 82, step 3) — for unit tests and for dev
 * without a recognizer. It does not listen: it "hears" the reference text, deterministically
 * short of some words, so the reading check downstream has something real to count.
 *
 *  - `ok` — every 8th word missed (7 of 8 read: passes the default 85 %);
 *  - `perfect` — every word read;
 *  - `misses` — every 3rd word missed (fails);
 *  - `silence` — nothing heard;
 *  - the rest — the failure of that name, as `FakeLlmProvider` raises it.
 *
 * The scenario comes, as with the fake language model, from a `@fake:<scenario>` marker in the
 * reference text, else from the model id (`fake-speech-misses`), else `ok`. The audio must still
 * be a WAV within the model's limit and the language one the model lists — what a real provider
 * would refuse, the fake refuses too, so the route is tested on the same errors.
 */
@Injectable()
export class FakeSpeechAssessor implements SpeechAssessor {
  readonly kind = 'fake' as const;

  async assess(request: SpeechRequest, model: SpeechModelRef): Promise<SpeechResult> {
    const started = Date.now();
    const scenario = this.scenarioOf(request, model);
    throwIfFailure(scenario);

    const durationMs = wavDurationMs(request.audio.data);
    if (durationMs === null) throw new LlmError('invalid_request', 'fake: audio is not a WAV recording');
    if (durationMs > model.features.maxAudioSeconds * 1000) {
      throw new LlmError('invalid_request', `fake: audio is longer than ${model.features.maxAudioSeconds} s`);
    }
    if (!model.features.languages.includes(request.language)) {
      throw new LlmError('invalid_request', `fake: language "${request.language}" is not supported`);
    }

    const reference = lexicalWords(request.referenceText.replace(MARKER, ' '));
    const every = MISS_EVERY[scenario];
    const heardAt = (i: number) => scenario !== 'silence' && !(every && (i + 1) % every === 0);

    const words: HeardWord[] = [];
    reference.forEach((text, i) => {
      if (!heardAt(i)) return;
      const startMs = LEAD_MS + words.length * (WORD_MS + GAP_MS);
      words.push({ text, startMs, endMs: startMs + WORD_MS, confidence: 0.9 });
    });

    return {
      transcript: words.map((w) => w.text).join(' '),
      words: model.features.wordTimings ? words : words.map((w) => ({ ...w, startMs: 0, endMs: 0 })),
      pronunciation:
        request.pronunciation && model.features.pronunciation ? pronunciation(reference, heardAt) : null,
      audioMs: durationMs,
      providerRequestId: `fake_${randomUUID()}`,
      latencyMs: Date.now() - started,
    };
  }

  private scenarioOf(request: SpeechRequest, model: SpeechModelRef): FakeSpeechScenario {
    const fromRequest = MARKER.exec(request.referenceText)?.[1];
    if (fromRequest) {
      if (!isScenario(fromRequest)) throw new Error(`Unknown fake speech scenario "${fromRequest}"`);
      return fromRequest;
    }
    const suffix = model.providerModelId.replace(/^fake-speech-?/, '').replace(/-/g, '_');
    return isScenario(suffix) ? suffix : 'ok';
  }
}

/** Steady made-up scores: omitted words at 0, the rest 80–90. */
function pronunciation(reference: string[], heardAt: (i: number) => boolean): PronunciationScores {
  const words = reference.map((text, i) =>
    heardAt(i)
      ? { text, accuracy: 90 - (i % 3) * 5, error: 'none' as const }
      : { text, accuracy: 0, error: 'omission' as const },
  );
  const spoken = words.filter((w) => w.error === 'none');
  return {
    accuracy: spoken.length === 0 ? 0 : Math.round(spoken.reduce((sum, w) => sum + w.accuracy, 0) / spoken.length),
    fluency: spoken.length === 0 ? 0 : 80,
    completeness: reference.length === 0 ? 0 : Math.round((spoken.length * 100) / reference.length),
    prosody: null,
    words,
  };
}

/** Lowercase, punctuation off — the lexical form a recognizer returns. */
function lexicalWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]+/gu, ''))
    .filter((w) => w.length > 0);
}

function throwIfFailure(scenario: FakeSpeechScenario): void {
  switch (scenario) {
    case 'timeout':
      throw new LlmError('timeout', 'fake: recognition timed out');
    case 'rate_limited':
      throw new LlmError('rate_limited', 'fake: rate limited', { retryAfterMs: 1000 });
    case 'overloaded':
      throw new LlmError('overloaded', 'fake: overloaded');
    case 'auth':
      throw new LlmError('auth', 'fake: invalid credentials');
    case 'invalid_request':
      throw new LlmError('invalid_request', 'fake: invalid request');
    case 'unavailable':
      throw new LlmError('unavailable', 'fake: provider unavailable');
    default:
      return;
  }
}

function isScenario(value: string): value is FakeSpeechScenario {
  return (FAKE_SPEECH_SCENARIOS as readonly string[]).includes(value);
}
