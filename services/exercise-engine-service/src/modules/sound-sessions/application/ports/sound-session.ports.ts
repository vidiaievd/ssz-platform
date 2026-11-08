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
    public readonly source: 'learning' | 'content' | 'ai',
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

/** content-service `GET internal/sound-atoms/drill?language=&atomIds=` (step 13.2). Empty `atomIds` — every scored sound. */
export interface ISoundDrillReader {
  read(language: string, atomIds: readonly string[]): Promise<Result<DrillMaterial, SoundSessionSourceError>>;
}

/** Who pays and whose take it is — as the sentence drill of 6g sends it. */
export interface TakePayer {
  /** The school whose `ai.practice` pays; null — the learner's own plan. */
  schoolId: string | null;
  userId: string;
}

/** A take judged on one sound by ai-service `internal/sentence-checks` with a `target` (step 13.3). */
export interface SoundTakeRequest extends TakePayer {
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
        | 'pool_empty'
        | 'not_available'
        | 'target_not_scored'
        | 'target_not_in_sentence';
      retryAfterMs: number | null;
    }
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

/** A toneme take against the word's reference clip, ai-service `internal/toneme-checks` (plan 88, step 8.3). */
export interface TonemeTakeRequest extends TakePayer {
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
        | 'pool_empty';
    }
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

export const SOUND_TAKE_JUDGE = Symbol('ISoundTakeJudge');

/** ai-service, for the two ways a take of a session is heard. No retry: the call may be billed. */
export interface ISoundTakeJudge {
  sounds(request: SoundTakeRequest): Promise<Result<SoundTakeOutcome, SoundSessionSourceError>>;
  toneme(request: TonemeTakeRequest): Promise<Result<TonemeTakeOutcome, SoundSessionSourceError>>;
}
