import type { Result } from '../../kernel/result.js';

export class OrganizationClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'OrganizationClientError';
  }
}

export type SchoolRole = 'OWNER' | 'ADMIN' | 'TEACHER' | 'STUDENT';

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');

export interface IOrganizationClient {
  getMemberRole(
    schoolId: string,
    userId: string,
  ): Promise<Result<SchoolRole | null, OrganizationClientError>>;
}
