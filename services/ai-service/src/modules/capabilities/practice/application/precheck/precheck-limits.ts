import { formatMicroCredits, microCredits } from '../../../../ledger/domain/credits.js';
import type { PracticeUsage } from '../ports/practice-usage.reader.js';

/** The ledger's surface for rehearsals; what the limits count by. */
export const PRECHECK_SURFACE = 'precheck';

/**
 * The school's limits for its learners' rehearsals (plan 84 §2, Q2), as the engine read them
 * from organization-service; null = no limit. The third level, the school's pool, is the
 * gate's: `ai.practice` credits of the tariff.
 */
export interface PrecheckLimits {
  /** Checks per (learner, exercise), ever. */
  perExercise: number | null;
  /** Credits per learner per calendar month (UTC). */
  perLearnerMonthlyCredits: number | null;
}

/** What is left after the call; null where there is no limit (or the ledger could not be read). */
export interface PrecheckRemaining {
  exercise: number | null;
  /** Six decimals. */
  learnerCredits: string | null;
  /** ≈ checks the credits left buy, at this learner's average this month; null without one. */
  learnerChecksApprox: number | null;
}

export type LimitRefusal = 'exercise_limit' | 'learner_limit';

/** The calendar month (UTC) `now` falls in, `[from, to)`. */
export function calendarMonthOf(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function learnerLimitMicro(limits: PrecheckLimits): bigint | null {
  return limits.perLearnerMonthlyCredits === null ? null : microCredits(limits.perLearnerMonthlyCredits.toFixed(6));
}

/** Which limit the usage has reached already, if any — checked before any call. */
export function limitReached(limits: PrecheckLimits, usage: PracticeUsage): LimitRefusal | null {
  if (limits.perExercise !== null && usage.exerciseChecks >= limits.perExercise) return 'exercise_limit';
  const cap = learnerLimitMicro(limits);
  if (cap !== null && usage.learnerMicro >= cap) return 'learner_limit';
  return null;
}

/**
 * What is left, with this check's own calls added to the usage read before it: `counted` —
 * a model answered, so it is one check more; `credits` — what its calls were billed.
 */
export function remainingAfter(
  limits: PrecheckLimits,
  usage: PracticeUsage,
  thisCheck: { counted: boolean; credits: Array<string | null> } = { counted: false, credits: [] },
): PrecheckRemaining {
  const checks = usage.exerciseChecks + (thisCheck.counted ? 1 : 0);
  const spent = thisCheck.credits.reduce((sum, c) => sum + (c ? microCredits(c) : 0n), usage.learnerMicro);
  const learnerChecks = usage.learnerChecks + (thisCheck.counted ? 1 : 0);
  const cap = learnerLimitMicro(limits);
  const left = cap === null ? null : cap > spent ? cap - spent : 0n;
  return {
    exercise: limits.perExercise === null ? null : Math.max(0, limits.perExercise - checks),
    learnerCredits: left === null ? null : formatMicroCredits(left),
    learnerChecksApprox: left === null || learnerChecks === 0 || spent === 0n ? null : Number(left / (spent / BigInt(learnerChecks) || 1n)),
  };
}
