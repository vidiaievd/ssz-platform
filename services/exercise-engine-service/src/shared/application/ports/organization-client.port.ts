import type { Result } from '../../kernel/result.js';

export const ORGANIZATION_CLIENT = Symbol('IOrganizationClient');

export type MemberRole = 'owner' | 'admin' | 'teacher' | 'student';

export interface GetMemberRoleOutput {
  role: MemberRole;
}

/** Where a learner's work belongs: their workspace, and their group inside it. */
export interface LearnerReviewContext {
  schoolId: string | null;
  groupId: string | null;
  groupName: string | null;
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

/** A school's lifecycle status (plan 90, phase 5); only `active` takes new work. */
export type SchoolLifecycleStatus = 'active' | 'suspended' | 'closed' | 'purged';

export interface IOrganizationClient {
  /** Where a school stands; a 404 error for an unknown school. */
  getSchoolStatus(
    schoolId: string,
  ): Promise<Result<SchoolLifecycleStatus, OrganizationClientError>>;

  getMemberRole(
    schoolId: string,
    userId: string,
  ): Promise<Result<GetMemberRoleOutput, OrganizationClientError>>;

  /**
   * Best-effort at attempt start (plan 44 §44.4) — a miss must not block starting.
   *
   * Asked about the learner, not about a school: the workspace is part of the answer.
   * `preferredSchoolId` is the content owner's school when it has one, and only breaks
   * ties (plan 59 §3, phase 3.2).
   */
  resolveLearnerReviewContext(
    userId: string,
    hints?: {
      courseId?: string | null;
      preferredSchoolId?: string | null;
      preferredTeacherId?: string | null;
    },
  ): Promise<Result<LearnerReviewContext, OrganizationClientError>>;
}
