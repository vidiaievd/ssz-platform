/** organization-service, asked only whether a user belongs to a workspace. */
export interface IOrganizationClient {
  /**
   * The user's role in the school (owner included), or null when they are neither on its
   * roster nor its owner. Throws when organization-service cannot answer.
   */
  memberRole(schoolId: string, userId: string): Promise<string | null>;
}

export const ORGANIZATION_CLIENT = Symbol('ORGANIZATION_CLIENT');
