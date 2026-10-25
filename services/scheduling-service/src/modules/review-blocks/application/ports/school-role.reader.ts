export const SCHOOL_ROLE_READER = Symbol('ISchoolRoleReader');

/**
 * A person's role in a school as organization-service knows it — owner included,
 * which the local membership projection cannot say. Null for an outsider.
 */
export interface ISchoolRoleReader {
  getMemberRole(schoolId: string, userId: string): Promise<string | null>;
}
