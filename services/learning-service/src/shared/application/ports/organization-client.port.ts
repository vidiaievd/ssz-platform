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

/**
 * Where a learner's work belongs — their workspace and their group in it.
 *
 * A private tutor's course names no school, so an enrolment on it used to be stored
 * with `schoolId: null` and the tutor's dashboard counted zero students. The workspace
 * comes from the *learner*, exactly as it does for a submitted attempt (plan 59 §3).
 */
export interface LearnerWorkspaceRef {
  schoolId: string | null;
  groupId: string | null;
  groupName: string | null;
}

export interface LearnerWorkspaceHints {
  courseId?: string;
  // The content's own school and author — tie-breaks only, for a learner who sits in
  // more than one workspace.
  preferredSchoolId?: string | null;
  preferredTeacherId?: string | null;
}

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');

export interface IOrganizationClient {
  getMemberRole(
    schoolId: string,
    userId: string,
  ): Promise<Result<SchoolRole | null, OrganizationClientError>>;

  getLearnerWorkspace(
    userId: string,
    hints?: LearnerWorkspaceHints,
  ): Promise<Result<LearnerWorkspaceRef, OrganizationClientError>>;

  getGroupMemberIds(
    schoolId: string,
    groupId: string,
  ): Promise<Result<string[], OrganizationClientError>>;
}
