export type SchoolMemberRole = 'owner' | 'admin' | 'teacher' | 'student' | 'content_admin';

export interface CourseTeacher {
  groupId: string;
  groupName: string;
  userId: string;
  role: string;
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
}

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');
