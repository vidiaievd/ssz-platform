import type { ReviewAspect } from '../../domain/review-aspect.js';
import type { ReviewRemark } from '../../domain/translate-review.js';

export const REVIEW_ATTEMPTS_CLIENT = Symbol('IReviewAttemptsClient');

/** A `translate_*` submission as exercise-engine reads it: the key beside the answer. */
export interface TranslateSubject {
  template: 'translate';
  langs: { explain: string; target: string };
  /** The author's AI block as stored; what it allows is decided here. */
  ai: { on: boolean; checks: Partial<Record<ReviewAspect, boolean>> };
  sentences: Array<{
    itemId: string;
    direction: 'to_target' | 'from_target';
    source: string;
    refs: string[];
    answer: string;
    explanation?: string;
    teacherNote?: string;
  }>;
}

/** What exercise-engine answers about a submission: something to review, or why not. */
export interface ReviewSubjectResult {
  attemptId: string;
  userId: string;
  schoolId: string | null;
  templateCode: string;
  /** `ATTEMPT_NOT_IN_REVIEW`, `NO_TEACHER_REVIEW`, `DRAFT_EXISTS`, `TEMPLATE_NOT_SUPPORTED`, `EXERCISE_GONE`. */
  skip: string | null;
  subject: TranslateSubject | null;
}

/** One write of the draft: the remarks, or the record that the model call failed. */
export type DraftToWrite =
  | { status: 'ready'; items: ReviewRemark[]; summary: string | null }
  | { status: 'failed'; errorCode: string };

export interface DraftWriteMeta {
  aiCallId: string;
  providerId: string | null;
  modelId: string | null;
  promptVersion: string | null;
}

/** The submission's side of the work, in exercise-engine (plan 79, steps 1.2–1.3). */
export interface IReviewAttemptsClient {
  /** Null when the attempt is unknown. Throws when the engine cannot answer now. */
  getSubject(attemptId: string): Promise<ReviewSubjectResult | null>;
  /**
   * `written`, or `refused` with the engine's code (decided meanwhile, not in review).
   * Throws when the engine cannot answer now.
   */
  putDraft(attemptId: string, draft: DraftToWrite, meta: DraftWriteMeta): Promise<{ written: true } | { written: false; code: string }>;
}
