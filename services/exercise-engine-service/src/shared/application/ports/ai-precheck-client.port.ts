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
}
