/** Where a deleted learner still stands — what the normal removal paths would announce. */
export interface DeletedUserFootprint {
  /** Schools where the user is an active STUDENT member (archived ones were announced already). */
  activeStudentSchoolIds: string[];
  /** Active group seats, with the group's main course as `school.group.member.removed` carries it. */
  activeGroupSeats: { schoolId: string; groupId: string; courseId: string | null }[];
  /** Legacy tutoring groups the user is a student of. */
  tutoringGroupIds: string[];
}

export interface ErasedOrganizationData {
  schoolMembers: number;
  groupSeats: number;
  memberships: number;
  levelHistory: number;
  nudges: number;
  tutoringSeats: number;
  invitations: number;
  assistantLists: number;
}

export interface IDeletedUserEraser {
  footprint(userId: string): Promise<DeletedUserFootprint>;
  /**
   * Hard-deletes, in one transaction: student roster rows, group seats (any status), school
   * memberships (enrolment requests), level history, nudge rate-limit rows, tutoring seats,
   * school and tutoring invitations to the address, and the user's place on per-school
   * assistant lists. Idempotent. Rows naming the user in another role are left alone.
   */
  erase(userId: string, email: string | null): Promise<ErasedOrganizationData>;
}

export const DELETED_USER_ERASER = Symbol('DELETED_USER_ERASER');
