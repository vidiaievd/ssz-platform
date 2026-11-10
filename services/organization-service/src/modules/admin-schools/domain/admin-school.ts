/**
 * The platform admin's read of schools (plan 90, phase 1, step 7). A read model, not an
 * aggregate: the panel only looks here, every change to a school goes through its own
 * commands with a reason (later phases).
 */

import type { SeatUsage } from '../../schools/domain/value-objects/seat-policy.vo.js';

export type SchoolKindValue = 'SCHOOL' | 'SOLO';

/**
 * Where a school stands today. `deleted` is a soft-deleted row, `inactive` a row switched
 * off without deleting it. The lifecycle of phase 5 (suspended → closed → purged) will
 * replace this derivation with a stored status.
 */
export type AdminSchoolStatus = 'active' | 'inactive' | 'deleted';
export const ADMIN_SCHOOL_STATUSES: readonly AdminSchoolStatus[] = ['active', 'inactive', 'deleted'];

export function schoolStatus(isActive: boolean, deletedAt: Date | null): AdminSchoolStatus {
  if (deletedAt) return 'deleted';
  return isActive ? 'active' : 'inactive';
}

/** Sort keys; a leading `-` means descending. Ties always break by id, so pages never overlap. */
export type AdminSchoolSort = 'createdAt' | '-createdAt' | 'name' | '-name';
export const ADMIN_SCHOOL_SORTS: readonly AdminSchoolSort[] = ['createdAt', '-createdAt', 'name', '-name'];
export const ADMIN_SCHOOL_SORT_DEFAULT: AdminSchoolSort = '-createdAt';

export const ADMIN_SCHOOLS_PAGE_DEFAULT = 25;
export const ADMIN_SCHOOLS_PAGE_MAX = 100;

export interface AdminSchoolFilter {
  /** Case-insensitive substring of the name or the slug. */
  search?: string;
  kind?: SchoolKindValue;
  /** No status = every row, soft-deleted ones included: the admin sees what is there. */
  status?: AdminSchoolStatus;
  seats?: AdminSchoolSeatsFilter;
}

/**
 * Seat filter of the list (plan 90, phase 4). `near` = at 90 % of the limit or more, not yet
 * over it; `over` = more active learners than the limit. Schools without a numeric limit
 * (none stated, or not projected yet) match neither.
 */
export type AdminSchoolSeatsFilter = 'near' | 'over';
export const ADMIN_SCHOOL_SEATS_FILTERS: readonly AdminSchoolSeatsFilter[] = ['near', 'over'];

/** Share of the limit from which a school counts as `near`. */
export const SEATS_NEAR_RATIO = 0.9;

/** Head counts on the roster; the owner is not a roster row and counts in none of them. */
export interface AdminSchoolCounts {
  /** Active STUDENT rows — what seats will be counted against (phase 4). */
  students: number;
  teachers: number;
}

export interface AdminSchoolListItem {
  id: string;
  name: string;
  slug: string;
  kind: SchoolKindValue;
  status: AdminSchoolStatus;
  ownerId: string;
  city: string | null;
  createdAt: Date;
  counts: AdminSchoolCounts;
  /** `used` = `counts.students`; `limit` null = no limit stated or not projected yet. */
  seats: { used: number; limit: number | null };
}

export interface AdminSchoolPage {
  items: AdminSchoolListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminSchoolGroup {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  /** The SOLO workspace's own group that holds every learner (plan 59); never shown to the tutor. */
  isDefault: boolean;
  courseId: string | null;
  level: string | null;
  /** Active members with the `student` role. */
  students: number;
}

export interface AdminSchoolDetail {
  id: string;
  name: string;
  slug: string;
  kind: SchoolKindValue;
  type: 'ONLINE' | 'HYBRID';
  status: AdminSchoolStatus;
  description: string | null;
  avatarUrl: string | null;
  contacts: { email: string | null; website: string | null; city: string | null };
  owner: { userId: string; name: string | null; email: string | null };
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  counts: AdminSchoolCounts & {
    archivedStudents: number;
    /** OWNER-less staff: ADMIN, MANAGER, CONTENT_ADMIN, SCHEDULER rows. */
    staff: number;
    /** Applications waiting for the school (pending, placement review). */
    pendingApplications: number;
    pendingInvitations: number;
  };
  /** From the local projection of the plan's limit, so a school never seen by the projection shows no limit. */
  seats: SeatUsage;
  /** Groups not deleted, newest first. */
  groups: AdminSchoolGroup[];
  /** Distinct courses the groups teach — main material and additional ones; names live in content-service. */
  courses: { count: number; ids: string[] };
}

/** The persistence side of the read; one query per count, never one per school. */
export interface IAdminSchoolsReader {
  list(filter: AdminSchoolFilter, sort: AdminSchoolSort, page: number, limit: number): Promise<AdminSchoolPage>;
  /** Everything but the owner's name and email, which come from profile-service. */
  findById(id: string): Promise<Omit<AdminSchoolDetail, 'owner'> & { ownerId: string } | null>;
}

export const ADMIN_SCHOOLS_READER = Symbol('IAdminSchoolsReader');
