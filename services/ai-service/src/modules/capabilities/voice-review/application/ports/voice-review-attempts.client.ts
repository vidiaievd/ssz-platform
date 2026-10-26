import type { SpeechResult } from '../../../../providers/domain/speech-result.js';
import type { DraftWriteMeta } from '../../../review-draft/application/ports/review-attempts.client.js';
import type { GiveUpReason } from '../../../review-direct/application/ports/direct-review-attempts.client.js';
import type { VoiceSubjectResult } from '../../domain/read-aloud-subject.js';

export const VOICE_REVIEW_ATTEMPTS_CLIENT = Symbol('IVoiceReviewAttemptsClient');

/**
 * What one prompt's recording was heard as — the speech model's answer as it is (engine step 7) —
 * and the ledger row of the call that heard it: a fallback or the plain level may answer one
 * prompt and not the next, and the review's own `aiCallId` is the first prompt's.
 */
export type PromptHearing = { itemId: string; aiCallId: string } & Pick<
  SpeechResult,
  'transcript' | 'words' | 'audioMs' | 'pronunciation'
>;

/** One write of a voice review: what was heard in every prompt, or the record that hearing failed. */
export type ReadingToWrite = { status: 'ready'; prompts: PromptHearing[] } | { status: 'failed'; errorCode: string };

/**
 * A reading aloud's side of the work, in exercise-engine (plan 82, steps 6–7): the passages
 * and recordings to hear, where what was heard is ruled on, and where ai-service gives up.
 */
export interface IVoiceReviewAttemptsClient {
  /** The subject under `voice_review`. Null when the attempt is unknown. Throws when the engine cannot answer now. */
  getSubject(attemptId: string): Promise<VoiceSubjectResult | null>;
  /**
   * `written` with where the attempt now stands, or `refused` with the engine's code. Throws
   * when the engine cannot answer now — a 409 or 503 included, the two worth a retry.
   */
  putReading(
    attemptId: string,
    reading: ReadingToWrite,
    meta: DraftWriteMeta,
  ): Promise<{ written: true; attemptStatus: string; provisional: boolean } | { written: false; code: string }>;
  /** `closed` as `NO_REVIEWER`, or `refused` with the engine's code. Throws when the engine cannot answer now. */
  giveUp(
    attemptId: string,
    reason: GiveUpReason,
    aiCallId: string | null,
  ): Promise<{ closed: true } | { closed: false; code: string }>;
}
