import type { ReviewAspect } from '../../domain/review-aspect.js';
import type { ReviewCaseSet } from '../../eval/domain/review-case.js';
import type { ReviewRemark } from '../../domain/review-remarks.js';

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

/** An `error_correction` submission as exercise-engine reads it, through the template's engine (step 1.7). */
export interface ErrorCorrectionSubject {
  template: 'error_correction';
  /** The language learnt, as the attempt records it (`nb`). */
  targetLanguage: string;
  note: string;
  ai: { on: boolean; checks: { explainWhy?: boolean; altFixes?: boolean; register?: boolean } };
  sentences: Array<{
    itemId: string;
    given: string;
    refs: string[];
    answer: string;
    matchesKey: boolean;
    mistakes: Array<{ wrong: string; fix: string; type: string; state: string; submitted: string; note?: string }>;
    stray: string[];
    teacherNote?: string;
  }>;
}

/** A submission beside its key, in its template's shape. */
export type EngineSubject = TranslateSubject | ErrorCorrectionSubject;

/** What exercise-engine answers about a submission: something to review, or why not. */
export interface ReviewSubjectResult {
  attemptId: string;
  userId: string;
  schoolId: string | null;
  templateCode: string;
  /** `ATTEMPT_NOT_IN_REVIEW`, `NO_TEACHER_REVIEW`, `DRAFT_EXISTS`, `TEMPLATE_NOT_SUPPORTED`, `EXERCISE_GONE`. */
  skip: string | null;
  subject: EngineSubject | null;
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

/** The submission's side of the work, in exercise-engine (plan 79, steps 1.2–1.3, 1.6). */
export interface IReviewAttemptsClient {
  /** Null when the attempt is unknown. Throws when the engine cannot answer now. */
  getSubject(attemptId: string): Promise<ReviewSubjectResult | null>;
  /**
   * `written`, or `refused` with the engine's code (decided meanwhile, not in review).
   * Throws when the engine cannot answer now.
   */
  putDraft(attemptId: string, draft: DraftToWrite, meta: DraftWriteMeta): Promise<{ written: true } | { written: false; code: string }>;
  /** Teachers' settled drafts, newest first, as labelled data. Throws when the engine cannot answer now. */
  listCases(limit: number): Promise<ReviewCaseSet>;
}
