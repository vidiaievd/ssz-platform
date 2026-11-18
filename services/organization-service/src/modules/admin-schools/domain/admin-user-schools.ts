/**
 * The schools of one user as the platform admin sees them (plan 90, phase 6, step 4): the
 * schools the user owns and the rosters the user is on. Read model only.
 *
 * Organization does not know users — an id it never saw simply has no schools, never 404.
 * Purged schools are left out (only a tombstone is left of them); closed ones are shown.
 */

import { adminMemberRole, type AdminMemberGroup, type AdminMemberRole, type AdminMemberStatus, type RosterRole } from './admin-school-roster.js';
import type { AdminSchoolStatus, SchoolKindValue } from './admin-school.js';

/** What a row says about its school. */
export interface AdminUserSchoolRef {
  id: string;
  name: string;
  slug: string;
  kind: SchoolKindValue;
  status: AdminSchoolStatus;
  /** When a suspended school closes by itself; null in any other status. */
  closesAt: Date | null;
  /** When a closed school is purged; null in any other status. */
  purgeAt: Date | null;
}

/** A school whose `owner_id` is the user. The owner is not a roster row. */
export interface AdminUserOwnedSchool extends AdminUserSchoolRef {
  createdAt: Date;
  /** Groups the owner teaches today (a SOLO tutor teaches every group of the workspace). */
  groups: AdminMemberGroup[];
}

/** A roster row of the user. */
export interface AdminUserMembership {
  school: AdminUserSchoolRef;
  role: AdminMemberRole;
  rosterRole: RosterRole;
  status: AdminMemberStatus;
  joinedAt: Date;
  /** Groups today: an active membership or a teaching assignment that has not ended; not deleted, by name. */
  groups: AdminMemberGroup[];
}

export interface AdminUserSchools {
  userId: string;
  /** Newest school first. */
  owned: AdminUserOwnedSchool[];
  /** Newest roster row first. */
  memberships: AdminUserMembership[];
}

/** Raw rows the reader hands over; the shaping rules live in `assembleUserSchools`. */
export interface AdminUserSchoolRows {
  owned: (AdminUserSchoolRef & { createdAt: Date })[];
  memberships: {
    school: AdminUserSchoolRef;
    role: RosterRole;
    status: AdminMemberStatus;
    joinedAt: Date;
  }[];
  /** The user's groups today, in any of the schools above. */
  groups: {
    schoolId: string;
    group: { id: string; name: string; isDefault: boolean };
    as: AdminMemberGroup['as'];
  }[];
}

export function assembleUserSchools(userId: string, rows: AdminUserSchoolRows): AdminUserSchools {
  const bySchool = new Map<string, AdminMemberGroup[]>();
  for (const { schoolId, group, as } of rows.groups) {
    const list = bySchool.get(schoolId) ?? [];
    // A teacher can hold one group as primary and as substitute; the group shows once per role.
    if (!list.some((g) => g.id === group.id && g.as === as)) list.push({ ...group, as });
    bySchool.set(schoolId, list);
  }
  for (const list of bySchool.values()) list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const groupsOf = (schoolId: string) => bySchool.get(schoolId) ?? [];

  const visible = (s: AdminUserSchoolRef) => s.status !== 'purged';
  return {
    userId,
    owned: rows.owned
      .filter(visible)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map((s) => ({ ...s, groups: groupsOf(s.id) })),
    memberships: rows.memberships
      .filter((m) => visible(m.school))
      .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime() || b.school.id.localeCompare(a.school.id))
      .map((m) => ({
        school: m.school,
        role: adminMemberRole(m.role),
        rosterRole: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        groups: groupsOf(m.school.id),
      })),
  };
}

export interface IAdminUserSchoolsReader {
  /** Purged schools are not asked for; groups are those of today. */
  rowsOf(userId: string): Promise<AdminUserSchoolRows>;
}

export const ADMIN_USER_SCHOOLS_READER = Symbol('IAdminUserSchoolsReader');
