import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { lexicalWord } from '../../domain/lexical.js';
import { LlmError } from '../../domain/llm-error.js';
import type { SpeechModelRef } from '../../domain/model-features.js';
import type { SpeechAssessor } from '../../domain/speech-assessor.port.js';
import type { SpeechRequest } from '../../domain/speech-request.js';
import type { HeardWord, PronouncedWord, PronunciationScores, SpeechResult } from '../../domain/speech-result.js';
import { wavDurationMs } from '../../domain/wav.js';
import { readCredential } from '../credentials.js';

/** Course language → Azure locale. Azure has no Nynorsk recognizer. */
const AZURE_LOCALE: Record<string, string> = { nb: 'nb-NO', en: 'en-US' };

/** Azure's REST endpoint for short audio takes at most 30 s with pronunciation assessment. */
export const AZURE_REST_MAX_AUDIO_SECONDS = 30;

/** Offsets and durations come in 100-nanosecond ticks. */
const TICKS_PER_MS = 10_000;

/** Statuses that mean "nothing was said", not a failure. */
const NOTHING_HEARD = new Set(['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout']);

/**
 * Scores sit on the word / best result itself in the REST answer, and under
 * `PronunciationAssessment` in the Speech SDK's JSON; both are read.
 */
interface AzureScored {
  AccuracyScore?: number;
  FluencyScore?: number;
  CompletenessScore?: number;
  ProsodyScore?: number;
  ErrorType?: string;
  PronunciationAssessment?: Omit<AzureScored, 'PronunciationAssessment'>;
}

interface AzureWord extends AzureScored {
  Word: string;
  Offset?: number | string;
  Duration?: number | string;
  Confidence?: number | string;
}

interface AzureBest extends AzureScored {
  Lexical?: string;
  Words?: AzureWord[];
}

/** What `…/conversation/cognitiveservices/v1?format=detailed` answers. */
interface AzureRecognition {
  RecognitionStatus: string;
  NBest?: AzureBest[];
}

/**
 * Azure AI Speech with Pronunciation Assessment (plan 82, step 9) — the REST endpoint for short
 * audio: `POST {baseUrl}/speech/recognition/conversation/cognitiveservices/v1`, the WAV as the
 * body, the key in `Ocp-Apim-Subscription-Key`, the assessment asked for in a base64
 * `Pronunciation-Assessment` header. `baseUrl` is the resource's speech endpoint
 * (`https://<region>.stt.speech.microsoft.com`).
 *
 * Unlike a plain recognizer, pronunciation assessment is meant to be given the passage: it
 * aligns what it heard with it (miscue on), so a skipped word comes back as an omission and an
 * extra one as an insertion. The words heard are the aligned words minus omissions; their
 * scores are feedback only (§2.3) — the engine rules from the words.
 *
 * Without `pronunciation` the passage is not sent and the call is plain recognition, so the
 * recognizer is not primed (see `SpeechRequest.referenceText`).
 *
 * At most 30 s a call: `maxAudioSeconds` of the model says so and the router hands a longer
 * recording to the fallback. Longer audio needs the Speech SDK (step 9b).
 */
@Injectable()
export class AzureSpeechAssessor implements SpeechAssessor {
  readonly kind = 'azure_speech' as const;

  async assess(request: SpeechRequest, model: SpeechModelRef): Promise<SpeechResult> {
    const key = readCredential(model.provider);
    if (!key) throw new LlmError('auth', `Provider "${model.provider.code}" is not configured: no credentialRef`);
    const baseUrl = model.provider.baseUrl;
    if (!baseUrl) {
      throw new LlmError('auth', `Provider "${model.provider.code}" is not configured: baseUrl is not set`);
    }
    const durationMs = wavDurationMs(request.audio.data);
    if (durationMs === null) throw new LlmError('invalid_request', 'Azure Speech: audio is not a WAV recording');
    const maxSeconds = Math.min(model.features.maxAudioSeconds, AZURE_REST_MAX_AUDIO_SECONDS);
    if (durationMs > maxSeconds * 1000) {
      throw new LlmError('invalid_request', `Azure Speech: audio is longer than ${maxSeconds} s`);
    }
    const locale = AZURE_LOCALE[request.language];
    if (!locale || !model.features.languages.includes(request.language)) {
      throw new LlmError('invalid_request', `Azure Speech: language "${request.language}" is not supported`);
    }
    const assess = request.pronunciation && model.features.pronunciation;

    const url = new URL(
      'speech/recognition/conversation/cognitiveservices/v1',
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set('language', locale);
    url.searchParams.set('format', 'detailed');
    url.searchParams.set('wordLevelTimestamps', 'true');
    const requestId = randomUUID();
    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      Accept: 'application/json',
      'X-ClientRequestId': requestId,
    };
    if (assess) headers['Pronunciation-Assessment'] = assessmentHeader(request.referenceText);

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        // Recordings are read into plain ArrayBuffers, never shared memory.
        body: request.audio.data as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (err) {
      throw fromFetchFailure(err);
    }
    if (!response.ok) throw await fromStatus(response);

    let body: AzureRecognition;
    try {
      body = (await response.json()) as AzureRecognition;
    } catch (err) {
      throw fromFetchFailure(err);
    }

    const providerRequestId = response.headers.get('x-requestid') ?? response.headers.get('apim-request-id') ?? requestId;
    const common = { audioMs: durationMs, providerRequestId, latencyMs: Date.now() - started };

    if (NOTHING_HEARD.has(body?.RecognitionStatus)) {
      return { transcript: '', words: [], pronunciation: null, ...common };
    }
    const best = body?.RecognitionStatus === 'Success' ? body.NBest?.[0] : undefined;
    if (!best) throw new LlmError('unknown', `Azure Speech: recognition status "${body?.RecognitionStatus}"`);

    const aligned = best.Words ?? [];
    const words: HeardWord[] = aligned.flatMap((w) => {
      const text = lexicalWord(w.Word);
      if (!text || errorOf(w) === 'omission') return [];
      const startMs = ticksToMs(w.Offset);
      return [{ text, startMs, endMs: startMs + ticksToMs(w.Duration), confidence: confidenceOf(w.Confidence) }];
    });
    // Built from the words rather than `Lexical`: with miscue, the aligned words are the miscue
    // view of what was read, and a word Azure calls omitted must not reappear here.
    const transcript = aligned.length > 0 ? words.map((w) => w.text).join(' ') : lexicalText(best.Lexical);

    return { transcript, words, pronunciation: assess ? scoresOf(best, aligned) : null, ...common };
  }
}

/** What the assessment is asked for: 0–100 scores per word, against the passage, with miscue. */
function assessmentHeader(referenceText: string): string {
  const params = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Word',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
  };
  return Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
}

function scoresOf(best: AzureBest, aligned: AzureWord[]): PronunciationScores {
  const words: PronouncedWord[] = aligned.flatMap((w) => {
    const text = lexicalWord(w.Word);
    return text ? [{ text, accuracy: score(w, 'AccuracyScore') ?? 0, error: errorOf(w) }] : [];
  });
  return {
    accuracy: score(best, 'AccuracyScore') ?? 0,
    fluency: score(best, 'FluencyScore') ?? 0,
    completeness: score(best, 'CompletenessScore') ?? 0,
    // Prosody is scored for a few locales only (not `nb-NO`).
    prosody: score(best, 'ProsodyScore'),
    words,
  };
}

function score(scored: AzureScored, field: 'AccuracyScore' | 'FluencyScore' | 'CompletenessScore' | 'ProsodyScore'): number | null {
  const raw = scored.PronunciationAssessment?.[field] ?? scored[field];
  if (raw === undefined || raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

/** Azure's own error types; the prosody ones (breaks, monotone) are not reading errors. */
function errorOf(word: AzureScored): PronouncedWord['error'] {
  switch (word.PronunciationAssessment?.ErrorType ?? word.ErrorType) {
    case 'Mispronunciation':
      return 'mispronunciation';
    case 'Omission':
      return 'omission';
    case 'Insertion':
      return 'insertion';
    default:
      return 'none';
  }
}

function ticksToMs(ticks: number | string | undefined): number {
  const value = Number(ticks);
  return Number.isFinite(value) && value > 0 ? Math.round(value / TICKS_PER_MS) : 0;
}

function confidenceOf(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

function lexicalText(text: string | undefined): string {
  return (text ?? '')
    .split(/\s+/)
    .map(lexicalWord)
    .filter((w) => w.length > 0)
    .join(' ');
}

/** The call never got an answer: our timeout, or the endpoint is unreachable. */
function fromFetchFailure(err: unknown): LlmError {
  // Not `instanceof Error`: the timeout is a DOMException, which may come from another realm.
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new LlmError('timeout', 'Azure Speech: request timed out', { cause: err });
  }
  const detail = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
  return new LlmError('unavailable', `Azure Speech: connection failed — ${detail}`, { cause: err });
}

async function fromStatus(response: Response): Promise<LlmError> {
  const status = response.status;
  const detail = await response.text().catch(() => '');
  const message = `Azure Speech ${status}: ${detail.slice(0, 300)}`;
  if (status === 401 || status === 403) return new LlmError('auth', message);
  if (status === 429) return new LlmError('rate_limited', message, { retryAfterMs: retryAfterMs(response.headers) });
  if (status === 408) return new LlmError('timeout', message);
  if ([400, 413, 415, 422].includes(status)) return new LlmError('invalid_request', message);
  if (status >= 500) return new LlmError('unavailable', message);
  return new LlmError('unknown', message);
}

function retryAfterMs(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
