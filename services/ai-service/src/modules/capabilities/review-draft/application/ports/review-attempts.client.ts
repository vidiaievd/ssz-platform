import type { ReviewAspect } from '../../domain/review-aspect.js';
import type { ReviewCaseSet } from '../../eval/domain/review-case.js';
import type { ReviewRemark } from '../../domain/review-remarks.js';
import type { RubricCriterion, RubricHint } from '../../domain/rubric-marks.js';

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

/** A `writing_task` submission as exercise-engine reads it: the task, the engine's measurements, the text (step 1.7b). */
export interface WritingTaskSubject {
  template: 'writing_task';
  /** The language learnt, as the attempt records it (`nb`). */
  targetLanguage: string;
  mode: string;
  instruction: string;
  prompt: string;
  source: string;
  letter: { register: string; recipient: string } | null;
  imageCaption: string;
  points: Array<{ text: string; required: boolean; keywords: string[]; phrased: boolean; ticked: boolean }>;
  example: string;
  length: { words: number; paragraphs: number; minWords: number; maxWords: number };
  ai: { on: boolean; checks: { grammar?: boolean; task?: boolean; structure?: boolean; lexis?: boolean; draft?: boolean } };
  /**
   * The rubric frozen on the attempt; null when it carries none (step 1.7c). Absent from an
   * engine that predates the step — read as none.
   */
  rubric?: RubricCriterion[] | null;
  text: string;
}

/** A `short_answer` submission as exercise-engine reads it, through the template's grader (step 1.7e). */
export interface ShortAnswerSubject {
  template: 'short_answer';
  /** The language learnt, as the attempt records it (`nb`). */
  targetLanguage: string;
  instruction: string;
  ai: { on: boolean; checks: { grammar?: boolean } };
  /** The questions the learner answered; skipped ones are left out. */
  questions: Array<{
    itemId: string;
    kind: string;
    passage: string;
    prompt: string;
    model: string;
    why: string;
    elements: Array<{ label: string; required: boolean; hit: boolean }>;
    verdict: string;
    tooShort: boolean;
    answer: string;
  }>;
}

/** A submission beside its key, in its template's shape. */
export type EngineSubject = TranslateSubject | ErrorCorrectionSubject | WritingTaskSubject | ShortAnswerSubject;

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
  | { status: 'ready'; items: ReviewRemark[]; summary: string | null; marks: RubricHint[] | null }
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
