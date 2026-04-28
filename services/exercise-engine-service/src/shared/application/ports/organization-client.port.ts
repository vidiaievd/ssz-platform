import type { Result } from '../../kernel/result.js';

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');

export type MemberRole = 'owner' | 'admin' | 'teacher' | 'student';

export interface GetMemberRoleOutput {
  role: MemberRole;
}

export class OrganizationClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'OrganizationClientError';
  }
}

export interface IOrganizationClient {
  getMemberRole(
    schoolId: string,
    userId: string,
  ): Promise<Result<GetMemberRoleOutput, OrganizationClientError>>;
}
