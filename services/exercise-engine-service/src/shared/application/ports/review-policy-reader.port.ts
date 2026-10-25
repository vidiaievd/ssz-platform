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

/**
 * The two reads a school's review policy is made of. Each answers null when the course or
 * school is not there, and throws when its service cannot be reached — the caller decides
 * what an outage means.
 */
export interface IReviewPolicyReader {
  courseReviewPolicy(courseId: string): Promise<CourseReviewPolicy | null>;
  schoolReviewPolicy(schoolId: string): Promise<SchoolReviewPolicy | null>;
}
