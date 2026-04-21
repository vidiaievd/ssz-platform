export type SchoolMemberRole = 'owner' | 'admin' | 'teacher' | 'student' | 'content_admin';

export interface IOrganizationClient {
  /**
   * Returns the user's role in the given school, or null if not a member.
   * Throws OrganizationServiceUnavailableException if the service is unreachable
   * after all retries — VisibilityGuard translates that into HTTP 503.
   */
  getMemberRole(userId: string, schoolId: string): Promise<SchoolMemberRole | null>;
}

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');
