/**
 * Whether a user ever studied in a school (plan 90, Q11): learning-service knows it from the
 * school's enrolments and assignments, which outlive the roster. Asked only after a view of a
 * closed or purged school's material was refused. Throws when the answer cannot be read.
 */
export interface ISchoolLearnerLookup {
  wasSchoolLearner(userId: string, schoolId: string): Promise<boolean>;
}

export const SCHOOL_LEARNER_LOOKUP = Symbol('ISchoolLearnerLookup');
