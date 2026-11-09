import { randomUUID } from 'node:crypto';
import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import type { Payer } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayCallOf, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { PassageSounds, type WordSounds } from '../../../../pronunciation/application/passage-sounds.js';
import { hasSoundInventory } from '../../../../pronunciation/domain/sound-inventory.js';
import { weakSounds } from '../../../../pronunciation/domain/weak-sounds.js';
import { lexicalWord } from '../../../../providers/domain/lexical.js';
import { audible, recordingLevel } from '../../../../providers/domain/recording-level.js';
import type { SpeechResult } from '../../../../providers/domain/speech-result.js';
import { RECORDING_AUDIO_SOURCE, type IRecordingAudioSource } from '../../../voice-review/application/ports/recording-audio.source.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import {
  judgeSoundTarget,
  soundTargetOf,
  type SoundTarget,
  type SoundTargetRefusal,
  type TargetVerdict,
} from '../../domain/sound-target.js';
import { soundFindings, toVoiceFeedback, withSoundExplanations, type PassageHearing } from '../../domain/voice-feedback.js';
import type { SoundToExplain } from '../../../pronunciation-explain/domain/sound-explanations.js';
import { PRACTICE_VOICE } from '../../practice.capability.js';
import { SoundExplainer } from '../../../pronunciation-explain/application/sound-explainer.js';
import { PRONUNCIATION_EXPLAIN } from '../../../pronunciation-explain/pronunciation-explain.capability.js';
import { SENTENCE_CHECK_LIMITER, type ISentenceCheckLimiter } from '../ports/sentence-check.limiter.js';
import { SOUND_SESSION_LIMITER, type ISoundSessionLimiter } from '../../../sound-session/application/ports/sound-session.limiter.js';
import { SOUND_SESSION_SURFACE } from '../../../sound-session/domain/sound-session.js';
import { SentenceCheckCommand, type SentenceCheckRequest } from './sentence-check.command.js';

/** Where a sentence try is paid from: the pronunciation drill, not the rehearsal (plan 86, step 6g). */
export const SENTENCE_CHECK_SURFACE = 'pronunciation_drill';

/**
 * Why no try was made, on purpose: `language_not_supported` (no sound inventory), `attempt_limit`
 * (the learner's tries of this sentence today are spent), `session_limit` (a session's takes are
 * spent, step 14.1), `pool_empty`, `not_available`; with a
 * target (step 13.3) `target_not_scored` (not a sound atom of the language, or its family is not
 * scored in that context — the toneme is `toneme-checks`') and `target_not_in_sentence`.
 * A failure's `errorCode` is the provider's, `gate_unavailable` / `unavailable`, or
 * `recording_missing` / `recording_not_ready` / `recording_unreadable` / `recording_inaudible`.
 */
export type SentenceCheckRefusal =
  | 'language_not_supported'
  | 'attempt_limit'
  | 'session_limit'
  | 'pool_empty'
  | 'not_available'
  | SoundTargetRefusal;

/** The verdict on the target sound, and whether this take's feedback carries the model's explanation of its miss. */
export type SentenceCheckTargetOutcome = TargetVerdict & { explained: boolean };

export type SentenceCheckOutcome =
  /** `target` only when one was asked for. */
  | { status: 'ok'; feedback: AiFeedback; target?: SentenceCheckTargetOutcome; aiCallIds: string[] }
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
 *
 * A session's take (step 13.3) names a target sound: the verdict is ours, by the native
 * thresholds of the context, on the target words only (`judgeSoundTarget`). The model explains
 * every weak sound as before, except a miss of the target already explained on this element
 * (§5.5a: the same explanation twice is noise). The verdict is returned, not recorded — the
 * session rates the card. A session's take (`sessionId`, step 14.1) is paid from
 * `pronunciation_session` and counted against the session's takes, not the sentence's tries: a
 * word in its frame is said again on purpose. `explain: false` (a session's diagnostic, step 14.2)
 * measures and remarks without the model.
 */
@CommandHandler(SentenceCheckCommand)
export class SentenceCheckHandler implements ICommandHandler<SentenceCheckCommand, SentenceCheckOutcome> {
  private readonly logger = new Logger(SentenceCheckHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Inject(SENTENCE_CHECK_LIMITER) private readonly limiter: ISentenceCheckLimiter,
    @Inject(SOUND_SESSION_LIMITER) private readonly sessions: ISoundSessionLimiter,
    private readonly passageSounds: PassageSounds,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    private readonly explainer: SoundExplainer,
  ) {}

  async execute({ request }: SentenceCheckCommand): Promise<SentenceCheckOutcome> {
    if (!hasSoundInventory(request.language)) return { status: 'refused', reason: 'language_not_supported', retryAfterMs: null };
    const target = request.target ? soundTargetOf(request.language, request.sentence, request.target) : null;
    if (typeof target === 'string') return { status: 'refused', reason: target, retryAfterMs: null };

    if (request.sessionId !== null) {
      if (!(await this.sessions.take(request.sessionId))) return { status: 'refused', reason: 'session_limit', retryAfterMs: null };
    } else {
      const turn = await this.limiter.take(request.userId, request.sentence);
      if (!turn.allowed) return { status: 'refused', reason: 'attempt_limit', retryAfterMs: turn.retryAfterMs };
    }

    const take = await this.take(request.recordingAssetId);
    if (!(take instanceof Uint8Array)) return { status: 'failed', errorCode: take.errorCode, aiCallIds: [] };

    const context: CallContext = {
      payer: payerOf(request),
      actor: { userId: request.userId, role: 'student' },
      surface: request.sessionId !== null ? SOUND_SESSION_SURFACE : SENTENCE_CHECK_SURFACE,
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
    const scored = heard.pronunciation?.words ?? [];
    const sounds = target ? inContext(target, scored, await this.soundsOf(request, heard)) : await this.soundsOf(request, heard);
    const verdict = target ? judgeSoundTarget(request.language, target, scored, sounds) : null;
    const hearings: PassageHearing[] = [{ passageIndex: 0, heard, sounds }];
    let feedback = toVoiceFeedback(hearings, request.language);
    const weak = soundFindings(hearings, request.language);
    const asked = weak.map((finding) => !target || !verdict || worthExplaining(finding, target, verdict));
    let targetExplained = false;
    if (request.explain && asked.some(Boolean)) {
      const explained = await this.explainer.explain({
        capability: PRONUNCIATION_EXPLAIN.code,
        context,
        targetLanguage: request.language,
        explanationLanguage: await this.explanationLanguage(request),
        sounds: weak.filter((_, i) => asked[i]),
        what: 'a sentence',
      });
      calls.push(explained.call);
      if (explained.explanations) {
        feedback = withSoundExplanations(feedback, explained.explanations, asked);
        targetExplained = target !== null && weak.some((f, i) => asked[i] && isOfTarget(f, target));
      }
    }
    return {
      status: 'ok',
      feedback,
      ...(verdict ? { target: { ...verdict, explained: targetExplained } } : {}),
      aiCallIds: calls.map((c) => c.recorded.callId),
    };
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

/**
 * The sounds with the target words' weak ones read in the target's context: a word in its carrier
 * frame is held to the single-word thresholds (§5.5a), the frame around it to running speech's.
 */
function inContext(
  target: SoundTarget,
  scored: readonly { text: string }[],
  sounds: WordSounds[] | null,
): WordSounds[] | null {
  if (!sounds || target.context === 'fluent') return sounds;
  return sounds.map((s, j) =>
    target.words.includes(lexicalWord(scored[j]?.text ?? '')) ? { ...s, weak: weakSounds(s.alignment, target.context, false) } : s,
  );
}

/** A remark on the target's family in a target word. */
function isOfTarget(finding: SoundToExplain, target: SoundTarget): boolean {
  return finding.family === target.family && target.words.includes(lexicalWord(finding.word));
}

/**
 * Whether a remark goes to the model: any remark beside the target, as in the drill; the target's
 * miss once per kind of miss on the element (§5.5a).
 */
function worthExplaining(finding: SoundToExplain, target: SoundTarget, verdict: TargetVerdict): boolean {
  if (!isOfTarget(finding, target)) return true;
  return verdict.measured && !verdict.passed && !target.explained.includes(verdict.weakest.key!);
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
