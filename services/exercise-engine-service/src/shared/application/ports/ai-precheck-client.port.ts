import type { AiFeedback } from '@ssz/contracts';
import type { ReviewSubject } from '../../../modules/ai-drafts/application/queries/get-review-subject/review-subject.js';
import type { Result } from '../../kernel/result.js';

export const AI_PRECHECK_CLIENT = Symbol('IAiPrecheckClient');

/** The school's limits on its learners' rehearsals, as sent to ai-service; null = no limit. */
export interface PrecheckLimits {
  /** Checks per (learner, exercise), ever. */
  perExercise: number | null;
  /** Credits per learner per calendar month (UTC) — the lower of the school's and the plan's. */
  perLearnerMonthlyCredits: number | null;
}

export interface AiPrecheckRequest {
  schoolId: string;
  userId: string;
  exerciseId: string;
  attemptId: string;
  /**
   * The course the attempt sits in; null outside a course. ai-service names the course's
   * grammar atoms a remark may point at (plan 85, step 3a).
   */
  courseId: string | null;
  /** The work in progress beside its key — the same subject the review queue's draft reads. */
  subject: ReviewSubject;
  limits: PrecheckLimits;
}

/** What the limits leave after the request; null where there is no limit. */
export interface PrecheckRemaining {
  exercise: number | null;
  /** Six decimals. */
  learnerCredits: string | null;
  /** ≈ checks the credits left buy, at this learner's average this month. */
  learnerChecksApprox: number | null;
}

/** Why ai-service made no call, on purpose (plan 84, steps 2–3). */
export type AiPrecheckRefusal =
  | 'unaskable'
  | 'exercise_limit'
  | 'learner_limit'
  | 'pool_empty'
  | 'not_available'
  | 'template_not_supported';

/** ai-service `POST /api/v1/internal/precheck` — every outcome is its 200. */
export type AiPrecheckOutcome =
  | { status: 'ok'; feedback: AiFeedback; aiCallIds: string[]; remaining: PrecheckRemaining | null }
  | { status: 'refused'; reason: AiPrecheckRefusal; detail: string | null; remaining: PrecheckRemaining | null }
  | { status: 'failed'; errorCode: string; aiCallIds: string[]; remaining: PrecheckRemaining | null };

/** A learner's take of one sentence of a reading, heard on its own (plan 86, step 6g). */
export interface AiSentenceCheckRequest {
  /** The school whose `ai.practice` pays; null — the learner's own plan. */
  schoolId: string | null;
  userId: string;
  exerciseId: string;
  language: string;
  /** The language the sounds are explained in; null — ai-service picks the school's, else English. */
  explanationLanguage: string | null;
  sentence: string;
  recordingAssetId: string;
}

/** ai-service `POST /api/v1/internal/sentence-checks` — every outcome is its 200. */
export type AiSentenceCheckOutcome =
  | { status: 'ok'; feedback: AiFeedback; aiCallIds: string[] }
  | {
      status: 'refused';
      reason: 'language_not_supported' | 'attempt_limit' | 'pool_empty' | 'not_available';
      retryAfterMs: number | null;
    }
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

export class AiPrecheckClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AiPrecheckClientError';
  }
}

/** A rehearsal before hand-in, asked of ai-service while the learner waits (plan 84, step 5). */
export interface IAiPrecheckClient {
  precheck(request: AiPrecheckRequest): Promise<Result<AiPrecheckOutcome, AiPrecheckClientError>>;
  /** One sentence of a reading, heard outside the rehearsal's limits (plan 86, step 6g). */
  sentenceCheck(request: AiSentenceCheckRequest): Promise<Result<AiSentenceCheckOutcome, AiPrecheckClientError>>;
}
