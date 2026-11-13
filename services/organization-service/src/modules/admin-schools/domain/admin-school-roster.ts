/**
 * The platform admin's read of a school's people and settings (plan 90, phase 3, step 5).
 * Read models only: the panel looks, the school changes them through its own screens.
 */

/** How the panel groups roster roles. `staff` is every row that is neither a student nor a teacher. */
export type AdminMemberRole = 'student' | 'teacher' | 'staff';
export const ADMIN_MEMBER_ROLES: readonly AdminMemberRole[] = ['student', 'teacher', 'staff'];

/** `archived` is meaningful for students only; staff rows are always `active`. */
export type AdminMemberStatus = 'active' | 'archived';
export const ADMIN_MEMBER_STATUSES: readonly AdminMemberStatus[] = ['active', 'archived'];

export const ADMIN_MEMBERS_PAGE_DEFAULT = 50;
export const ADMIN_MEMBERS_PAGE_MAX = 200;

/** The roster role a member row carries, as Prisma names it. */
export type RosterRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CONTENT_ADMIN' | 'TEACHER' | 'STUDENT' | 'SCHEDULER';

export function adminMemberRole(role: RosterRole): AdminMemberRole {
  if (role === 'STUDENT') return 'student';
  if (role === 'TEACHER') return 'teacher';
  return 'staff';
}

export interface AdminMemberFilter {
  role?: AdminMemberRole;
  status?: AdminMemberStatus;
  /**
   * Members in this group today: a current membership (any group role) or a teaching
   * assignment that has not ended. A group of another school simply matches nobody.
   */
  groupId?: string;
}

export interface AdminMemberGroup {
  id: string;
  name: string;
  /** A SOLO workspace's hidden group that holds every learner (plan 59). */
  isDefault: boolean;
  /** `teacher` = a teaching assignment; otherwise the group membership role. */
  as: 'student' | 'trial' | 'observer' | 'teacher';
}

/** No email and no learning activity on purpose (plan 90 §6.3): the admin sees who, not how they study. */
export interface AdminMember {
  userId: string;
  /** Kept in sync from profile-service; null until the first sync — the panel then asks profiles. */
  name: string | null;
  role: AdminMemberRole;
  /** The exact roster role, e.g. MANAGER inside `staff`. */
  rosterRole: RosterRole;
  status: AdminMemberStatus;
  joinedAt: Date;
  /** Groups not deleted, by name. */
  groups: AdminMemberGroup[];
}

export interface AdminMemberPage {
  items: AdminMember[];
  total: number;
  page: number;
  limit: number;
}

/** The school's settings the admin reads in one answer; whether the plan still allows them is ai/subscription's. */
export interface AdminSchoolSettings {
  /** The response time the school promises and who hears when nobody answered. */
  review: {
    respondWithinHours: number;
    escalateAfterHours: number;
    escalateTo: 'school_admins' | 'owner' | 'primary_teacher';
  };
  /** Who answers a learner's work first (plan 80). */
  reviewAi: {
    mode: 'teacher_only' | 'ai_then_teacher' | 'ai_with_sampling';
    autoAcceptAfterHours: number;
    samplePercent: number;
  };
  /** Which students the assistant answers on the school's account (plan 83); lists cut to what is still the school's. */
  assistant: {
    mode: 'off' | 'all_students' | 'selected_groups' | 'selected_students';
    groupIds: string[];
    studentIds: string[];
  };
  /** The pre-hand-in check (plan 84); null = no limit of the school's own. */
  aiPrecheck: {
    enabled: boolean;
    perExerciseLimit: number | null;
    perLearnerMonthlyCredits: number | null;
  };
}

export interface IAdminSchoolRosterReader {
  /** Null when no school has this id (soft-deleted ones are found). */
  members(schoolId: string, filter: AdminMemberFilter, page: number, limit: number): Promise<AdminMemberPage | null>;
  settings(schoolId: string): Promise<AdminSchoolSettings | null>;
}

export const ADMIN_SCHOOL_ROSTER_READER = Symbol('IAdminSchoolRosterReader');
