export const PRECHECK_SETTINGS_READER = Symbol('IPrecheckSettingsReader');

/**
 * A school's "learners may check with a model before hand-in" (organization-service, plan 84
 * step 4), as saved — the plan is not checked there. Null limits: none from the school's side.
 */
export interface SchoolAiPrecheckSettings {
  enabled: boolean;
  perExerciseLimit: number | null;
  perLearnerMonthlyCredits: number | null;
}

/** Answers null when the school is not there; throws when organization-service cannot be reached. */
export interface IPrecheckSettingsReader {
  schoolAiPrecheck(schoolId: string): Promise<SchoolAiPrecheckSettings | null>;
}
