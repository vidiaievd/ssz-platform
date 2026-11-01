import type { SpeechResult } from '../../../../providers/domain/speech-result.js';
import type { DraftWriteMeta } from '../../../review-draft/application/ports/review-attempts.client.js';
import type { GiveUpReason } from '../../../review-direct/application/ports/direct-review-attempts.client.js';
import type { NamedSound } from '../../../../pronunciation/domain/sound-remarks.js';
import type { VoiceSubjectResult } from '../../domain/read-aloud-subject.js';
import type { ReadingSoundRemark } from '../../domain/reading-sounds.js';

export const VOICE_REVIEW_ATTEMPTS_CLIENT = Symbol('IVoiceReviewAttemptsClient');

/**
 * What one prompt's recording was heard as — the speech model's answer as it is (engine step 7) —
 * and the ledger row of the call that heard it: a fallback or the plain level may answer one
 * prompt and not the next, and the review's own `aiCallId` is the first prompt's.
 */
export type PromptHearing = { itemId: string; aiCallId: string } & Pick<
  SpeechResult,
  'transcript' | 'words' | 'audioMs' | 'pronunciation'
> & {
    /**
     * Beside each of `pronunciation.words`, its sounds in IPA (plan 88, step 5c) — null for a
     * word they could not be named in; absent or null when they were not measured. Azure's own
     * phonemes never leave ai-service: these go to the engine in their place.
     */
    sounds?: Array<NamedSound[] | null> | null;
  };

/**
 * One write of a voice review: what was heard in every prompt, the remarks on its weak sounds
 * (plan 88, step 5c) and a model's summary of them (step 5c.2; null when none explained them) —
 * or the record that hearing failed.
 */
export type ReadingToWrite =
  | { status: 'ready'; prompts: PromptHearing[]; remarks: ReadingSoundRemark[]; summary: string | null }
  | { status: 'failed'; errorCode: string };

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
