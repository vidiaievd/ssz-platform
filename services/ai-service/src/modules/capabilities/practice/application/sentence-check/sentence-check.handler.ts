import { randomUUID } from 'node:crypto';
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import type { Payer } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayCallOf, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { PassageSounds, type WordSounds } from '../../../../pronunciation/application/passage-sounds.js';
import { hasSoundInventory } from '../../../../pronunciation/domain/sound-inventory.js';
import { audible, recordingLevel } from '../../../../providers/domain/recording-level.js';
import type { SpeechResult } from '../../../../providers/domain/speech-result.js';
import { RECORDING_AUDIO_SOURCE, type IRecordingAudioSource } from '../../../voice-review/application/ports/recording-audio.source.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import { soundFindings, toVoiceFeedback, withSoundExplanations } from '../../domain/voice-feedback.js';
import { PRACTICE_VOICE } from '../../practice.capability.js';
import { explainSounds } from '../explain-sounds.js';
import { SENTENCE_CHECK_LIMITER, type ISentenceCheckLimiter } from '../ports/sentence-check.limiter.js';
import { SentenceCheckCommand, type SentenceCheckRequest } from './sentence-check.command.js';

/** Where a sentence try is paid from: the pronunciation drill, not the rehearsal (plan 86, step 6g). */
export const SENTENCE_CHECK_SURFACE = 'pronunciation_drill';

/**
 * Why no try was made, on purpose: `language_not_supported` (no sound inventory), `attempt_limit`
 * (the learner's tries of this sentence today are spent), `pool_empty`, `not_available`.
 * A failure's `errorCode` is the provider's, `gate_unavailable` / `unavailable`, or
 * `recording_missing` / `recording_not_ready` / `recording_unreadable` / `recording_inaudible`.
 */
export type SentenceCheckRefusal = 'language_not_supported' | 'attempt_limit' | 'pool_empty' | 'not_available';

export type SentenceCheckOutcome =
  | { status: 'ok'; feedback: AiFeedback; aiCallIds: string[] }
  | { status: 'refused'; reason: SentenceCheckRefusal; retryAfterMs: number | null }
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

/**
 * One sentence of a reading heard on its own (plan 86, step 6g): the same path as a rehearsed
 * passage — Azure → `PassageSounds` (fluent) → `pronunciation_explain` for the weak sounds — for a
 * single take, in the `AiFeedback` shape (passage 0 is the sentence). Sold under `ai.practice`,
 * the school paying or the learner on their own plan, surface `pronunciation_drill`.
 *
 * Outside the school's per-exercise limit and monthly learner credits (a drill would burn them in
 * a minute); its own limit is tries per sentence per UTC day. The gate's pool still holds the
 * spend. Nothing is written but the ledger: no attempt, no verdict, no atom.
 */
@CommandHandler(SentenceCheckCommand)
export class SentenceCheckHandler implements ICommandHandler<SentenceCheckCommand, SentenceCheckOutcome> {
  private readonly logger = new Logger(SentenceCheckHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Inject(SENTENCE_CHECK_LIMITER) private readonly limiter: ISentenceCheckLimiter,
    private readonly passageSounds: PassageSounds,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
  ) {}

  async execute({ request }: SentenceCheckCommand): Promise<SentenceCheckOutcome> {
    if (!hasSoundInventory(request.language)) return { status: 'refused', reason: 'language_not_supported', retryAfterMs: null };

    const turn = await this.limiter.take(request.userId, request.sentence);
    if (!turn.allowed) return { status: 'refused', reason: 'attempt_limit', retryAfterMs: turn.retryAfterMs };

    const take = await this.take(request.recordingAssetId);
    if (!(take instanceof Uint8Array)) return { status: 'failed', errorCode: take.errorCode, aiCallIds: [] };

    const context: CallContext = {
      payer: payerOf(request),
      actor: { userId: request.userId, role: 'student' },
      surface: SENTENCE_CHECK_SURFACE,
      subject: request.exerciseId ? { exerciseId: request.exerciseId, checkId: randomUUID() } : null,
    };
    const call = await this.gateway.callSpeech(PRACTICE_VOICE.code, context, {
      audio: { format: 'wav', data: take },
      referenceText: request.sentence,
      language: request.language,
      pronunciation: true,
    });
    const calls: GatewayCallOf<unknown>[] = [call];
    if (call.routed.isFail) return notAnswered(call.routed.error, [call.recorded.callId]);

    const heard = call.routed.value.result;
    const sounds = await this.soundsOf(request, heard);
    const hearings = [{ passageIndex: 0, heard, sounds }];
    let feedback = toVoiceFeedback(hearings, request.language);
    const weak = soundFindings(hearings, request.language);
    if (weak.length > 0) {
      const explained = await explainSounds(this.gateway, this.logger, context, request.language, await this.explanationLanguage(request), weak);
      calls.push(explained.call);
      if (explained.explanations) feedback = withSoundExplanations(feedback, explained.explanations);
    }
    return { status: 'ok', feedback, aiCallIds: calls.map((c) => c.recorded.callId) };
  }

  /** The caller's language, else the school's, else English — a nicety, so an unreadable school is not a failure. */
  private async explanationLanguage(request: SentenceCheckRequest): Promise<string> {
    if (request.explanationLanguage) return request.explanationLanguage;
    if (request.schoolId === null) return 'en';
    try {
      return (await this.schools.explanationLanguage(request.schoolId)) ?? 'en';
    } catch (err) {
      this.logger.warn(`Explanation language of school ${request.schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return 'en';
    }
  }

  /** The sentence's sounds, as a nicety: a lexicon that cannot be read leaves the words without them. */
  private async soundsOf(request: SentenceCheckRequest, heard: SpeechResult): Promise<WordSounds[] | null> {
    if (!heard.pronunciation) return null;
    try {
      return await this.passageSounds.of(request.language, request.sentence, heard.pronunciation.words, 'fluent');
    } catch (err) {
      this.logger.warn(`Sounds of a sentence not measured: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** The take as a speech model hears it, unless missing, not ready or too quiet to be heard. */
  private async take(assetId: string): Promise<Uint8Array | { errorCode: string }> {
    let audio;
    try {
      audio = await this.recordings.fetch(assetId);
    } catch (err) {
      this.logger.warn(`Take ${assetId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return { errorCode: 'recording_unreadable' };
    }
    if (audio.kind === 'missing') return { errorCode: 'recording_missing' };
    if (audio.kind === 'pending') return { errorCode: 'recording_not_ready' };
    const level = recordingLevel(audio.wav);
    if (!audible(level)) {
      this.logger.warn(`Take ${assetId} inaudible: voice ${level!.speechDb} dBFS, ${level!.contrastDb} dB over its noise`);
      return { errorCode: 'recording_inaudible' };
    }
    return audio.wav;
  }
}

/** The school when there is one, else the learner under their own plan. */
function payerOf(request: SentenceCheckRequest): Payer {
  return request.schoolId === null ? { type: 'user', id: request.userId } : { type: 'workspace', id: request.schoolId };
}

/** A call that reached no usable answer: refused on purpose, or failed. */
function notAnswered<R>(failure: GatewayFailureOf<R>, aiCallIds: string[]): SentenceCheckOutcome {
  switch (failure.kind) {
    case 'disabled':
      return { status: 'refused', reason: 'not_available', retryAfterMs: null };
    case 'refused':
      return { status: 'refused', reason: failure.code === 'quota_exhausted' ? 'pool_empty' : 'not_available', retryAfterMs: null };
    case 'gate_unavailable':
    case 'unavailable':
      return { status: 'failed', errorCode: failure.kind, aiCallIds };
    case 'error':
      return { status: 'failed', errorCode: failure.error.code, aiCallIds };
  }
}
