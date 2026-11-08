import type { AiFeedback } from '@ssz/contracts';
import type { Result } from '../../../../shared/kernel/result.js';
import type { DrillMaterial, LearnerSounds } from '../../domain/session-plan.js';

/**
 * What a pronunciation session reads from the other services (plan 86, step 13.4b). Three ports,
 * one per service, so that a session start can say which one is away: the learner's record
 * (learning-service), the drill material (content-service) and the judge of a take (ai-service).
 */

/** A service the session depends on did not answer usably; `statusCode` is its, or 503 when it was away. */
export class SoundSessionSourceError extends Error {
  constructor(
    public readonly source: 'learning' | 'content' | 'ai' | 'organization',
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'SoundSessionSourceError';
  }
}

export const LEARNER_SOUNDS_READER = Symbol('ILearnerSoundsReader');

/** learning-service `GET internal/learners/:userId/sound-atoms?language=` (step 13.1). */
export interface ILearnerSoundsReader {
  read(userId: string, language: string): Promise<Result<LearnerSounds, SoundSessionSourceError>>;
}

export const SOUND_DRILL_READER = Symbol('ISoundDrillReader');

/** A sound's articulation base in one interface locale (plan 86, step 9.1) — what the session says without a model. */
export interface SoundBaseText {
  atomId: string;
  /** The locale the texts are in: the asked one, or `en` when it has none. */
  locale: string;
  title: string;
  description: string | null;
  howTo: string | null;
  drill: string | null;
  /** The usual mistake of speakers of Russian and Ukrainian, written for them in every locale. */
  commonError: string | null;
  /** Where Ukrainian speakers differ; null — they do not. */
  ukNote: string | null;
}

export interface ISoundDrillReader {
  /** content-service `GET internal/sound-atoms/drill?language=&atomIds=` (step 13.2). Empty `atomIds` — every scored sound. */
  read(language: string, atomIds: readonly string[]): Promise<Result<DrillMaterial, SoundSessionSourceError>>;
  /** content-service `GET internal/sound-atoms?language=&locale=` (steps 8.1, 9.1): every sound's base texts. */
  base(language: string, locale: string): Promise<Result<SoundBaseText[], SoundSessionSourceError>>;
}

/** Who pays and whose take it is — as the sentence drill of 6g sends it. */
export interface TakePayer {
  /** The school whose `ai.practice` pays; null — the learner's own plan. */
  schoolId: string | null;
  userId: string;
}

/**
 * A take of a session (plan 86, step 14.1): the session's attempt id — ai-service pays it from
 * surface `pronunciation_session` and counts it against the session's takes, not a sentence's.
 */
export interface SessionTake extends TakePayer {
  sessionId: string;
}

/** A take judged on one sound by ai-service `internal/sentence-checks` with a `target` (step 13.3). */
export interface SoundTakeRequest extends SessionTake {
  /** The probe the session runs on — the ledger's `exerciseId`. */
  exerciseId: string;
  language: string;
  explanationLanguage: string | null;
  /** The carrier frame with the word, or the course line. */
  sentence: string;
  recordingAssetId: string;
  target: {
    atomId: string;
    words: string[];
    context: 'word' | 'fluent';
    explained: string[];
  };
}

export type TargetUnmeasured = 'no_sounds' | 'word_not_heard' | 'not_aligned' | 'family_not_heard';

/** ai-service's verdict on the target, as it answers it. */
export type SoundTargetVerdict =
  | {
      atomId: string;
      measured: true;
      passed: boolean;
      weakest: {
        word: string;
        symbols: string[];
        ipa: string | null;
        accuracy: number;
        threshold: number;
        severity: 'minor' | 'major' | null;
        key: string | null;
      };
      explained: boolean;
    }
  | { atomId: string; measured: false; reason: TargetUnmeasured; passed: false; weakest: null; explained: boolean };

/** `POST /api/v1/internal/sentence-checks` — every outcome is its 200. */
export type SoundTakeOutcome =
  | { status: 'ok'; feedback: AiFeedback; target: SoundTargetVerdict | null; aiCallIds: string[] }
  | {
      status: 'refused';
      reason:
        | 'language_not_supported'
        | 'attempt_limit'
        | 'session_limit'
        | 'pool_empty'
        | 'not_available'
        | 'target_not_scored'
        | 'target_not_in_sentence';
      retryAfterMs: number | null;
    }
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

/** A toneme take against the word's reference clip, ai-service `internal/toneme-checks` (plan 88, step 8.3). */
export interface TonemeTakeRequest extends SessionTake {
  language: string;
  word: string;
  recordingAssetId: string;
  referenceAssetId: string;
}

export type TonemeVerdictKind =
  | { kind: 'like_reference' }
  | { kind: 'other_tone'; heardAs: 1 | 2 }
  | { kind: 'unsure' }
  | { kind: 'not_measured' };

/** `POST /api/v1/internal/toneme-checks` — every outcome is its 200. */
export type TonemeTakeOutcome =
  | {
      status: 'ok';
      word: string;
      sentence: string;
      accuracy: number;
      comparison: { tone: 1 | 2; gap: number | null; verdict: TonemeVerdictKind };
      melody: { stepMs: number; learner: Array<number | null>; reference: Array<number | null> };
      aiCallIds: string[];
    }
  | {
      status: 'unheard';
      reason: 'word_not_heard' | 'sounds_not_aligned' | 'no_toneme_window';
      accuracy: number | null;
      aiCallIds: string[];
    }
  | {
      status: 'refused';
      reason:
        | 'not_a_word'
        | 'language_not_supported'
        | 'not_in_lexicon'
        | 'tone_ambiguous'
        | 'no_toneme'
        | 'not_a_reference'
        | 'not_available'
        | 'pool_empty'
        | 'session_limit';
    }
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

export const SOUND_TAKE_JUDGE = Symbol('ISoundTakeJudge');

/** ai-service, for the two ways a take of a session is heard. No retry: the call may be billed. */
export interface ISoundTakeJudge {
  sounds(request: SoundTakeRequest): Promise<Result<SoundTakeOutcome, SoundSessionSourceError>>;
  toneme(request: TonemeTakeRequest): Promise<Result<TonemeTakeOutcome, SoundSessionSourceError>>;
}

/** What a session may cost its payer (ai-service, step 14.1) — for the warning on its start (§5.5a). */
export interface SessionBudget {
  payer: 'school' | 'learner';
  /** False — the payer's `ai.practice` has no monthly allowance. */
  metered: boolean;
  /** Credits left this period, six decimals; null when unmetered or unknown. */
  remainingCredits: string | null;
  /** What one session is expected to cost, six decimals. */
  estimatedCredits: string;
  periodEnd: string | null;
}

/** ai-service `POST internal/sound-sessions/admit` — every outcome is its 200. */
export type SessionAdmission =
  | { status: 'admitted'; budget: SessionBudget }
  | { status: 'refused'; reason: 'session_limit' | 'not_available' | 'pool_empty'; retryAfterMs: number | null }
  | { status: 'failed'; errorCode: string };

export const SOUND_SESSION_ADMISSION = Symbol('ISoundSessionAdmission');

/**
 * Whether the learner may begin a session — the day's sessions and the payer's `ai.practice` —
 * and what it may cost (step 14.1). `resume`: a session already begun, only the budget.
 */
export interface ISoundSessionAdmission {
  admit(request: TakePayer & { resume: boolean }): Promise<Result<SessionAdmission, SoundSessionSourceError>>;
}

export const RECORDING_DISCARDER = Symbol('IRecordingDiscarder');

/**
 * Deletes a take once it is measured (plan 86 §5.6, 13.4d): a session keeps no voice — the
 * verdict is on the attempt, the recording is of no further use to anyone. media-service
 * `POST internal/media/assets/:assetId/discard`. False when it could not; the orphan sweep
 * (plan 71) is the net, since no submission ever names a session's take.
 */
export interface IRecordingDiscarder {
  discard(assetId: string, ownerId: string): Promise<boolean>;
}
