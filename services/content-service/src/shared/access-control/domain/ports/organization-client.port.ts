export type SchoolMemberRole = 'owner' | 'admin' | 'teacher' | 'student' | 'content_admin';

export interface CourseTeacher {
  groupId: string;
  groupName: string;
  userId: string;
  role: string;
}

/** What a school promises about answering work (plan 44 §44.12). */
export interface SchoolReviewSettings {
  respondWithinHours: number;
  escalateAfterHours: number;
  escalateTo: string;
}

export interface IOrganizationClient {
  /**
   * Returns the user's role in the given school, or null if not a member.
   * Throws OrganizationServiceUnavailableException if the service is unreachable
   * after all retries — VisibilityGuard translates that into HTTP 503.
   */
  getMemberRole(userId: string, schoolId: string): Promise<SchoolMemberRole | null>;

  /**
   * Returns the teachers of every group currently teaching the given course, across
   * the school. Empty array if no group teaches it (or the course has no teachers).
   * Throws OrganizationServiceUnavailableException if the service is unreachable
   * after all retries.
   */
  getCourseTeachers(schoolId: string, courseId: string): Promise<CourseTeacher[]>;

  /**
   * The school's promised response time — what a course inherits when it sets none.
   * `null` when the school is unknown to organization-service.
   * Throws OrganizationServiceUnavailableException if the service is unreachable.
   */
  getSchoolReviewSettings(schoolId: string): Promise<SchoolReviewSettings | null>;
}

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');
