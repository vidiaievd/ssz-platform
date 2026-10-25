export const REVIEW_POLICY_READER = Symbol('IReviewPolicyReader');

export type SchoolReviewMode = 'teacher_only' | 'ai_then_teacher' | 'ai_with_sampling';

/** A school's own review policy (organization-service, plan 80 step 1). */
export interface SchoolReviewPolicy {
  mode: SchoolReviewMode;
  autoAcceptAfterHours: number;
  samplePercent: number;
}

/**
 * A course's review policy with its school's behind it (content-service, plan 80 step 2):
 * one read gives the term that applies, the course's "always to a teacher" templates, and
 * the owning school's mode and share. The school fields are null when the course has no
 * school, or content-service could not reach it.
 */
export interface CourseReviewPolicy {
  autoAcceptAfterHours: number | null;
  teacherReviewTemplates: string[];
  schoolMode: SchoolReviewMode | null;
  samplePercent: number | null;
  ownerSchoolId: string | null;
}

/** Whose a starting figure is: the school set it, or organization-service's factory value. */
export type SchoolReviewMinutesSource = 'school' | 'default';

/**
 * Minutes per submission a school expects before its own measurements take over
 * (organization-service, plan 81 step 5b). Factory values come filled in, so every figure
 * here is usable as it is.
 */
export interface SchoolReviewEffortMinutes {
  /** Every factory template plus every one the school set. */
  templates: { templateCode: string; minutes: number; source: SchoolReviewMinutesSource }[];
  /** For a template on neither list. */
  other: { minutes: number; source: SchoolReviewMinutesSource };
}

/**
 * The reads a school's review policy is made of. Each answers null when the course or
 * school is not there, and throws when its service cannot be reached — the caller decides
 * what an outage means.
 */
export interface IReviewPolicyReader {
  courseReviewPolicy(courseId: string): Promise<CourseReviewPolicy | null>;
  schoolReviewPolicy(schoolId: string): Promise<SchoolReviewPolicy | null>;
  schoolReviewEffortMinutes(schoolId: string): Promise<SchoolReviewEffortMinutes | null>;
}
