/**
 * What a learner's rehearsals at one school have used, from the ledger (plan 84, step 3). A
 * check counts once a model answered one of its calls — whatever it cost; credits count
 * whatever the outcome, since a failed call that was billed was still paid for.
 */
export interface PracticeUsage {
  /** Checks of this exercise by this learner at this school, ever: a new attempt does not reset it. */
  exerciseChecks: number;
  /** Credits this learner's rehearsals at this school spent over the window, in micro-credits. */
  learnerMicro: bigint;
  /** Checks counted in that window; what an average check costs is read from these. */
  learnerChecks: number;
}

export interface IPracticeUsageReader {
  /** Throws when the ledger cannot be read. */
  usage(query: { schoolId: string; userId: string; exerciseId: string; from: Date; to: Date }): Promise<PracticeUsage>;
}

export const PRACTICE_USAGE_READER = Symbol('IPracticeUsageReader');
