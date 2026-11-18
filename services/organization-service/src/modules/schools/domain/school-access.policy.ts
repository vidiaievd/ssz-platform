/**
 * What a school's lifecycle status allows (plan 90, phase 5, step 3). Pure rules; the
 * transitions themselves live in `school-lifecycle`.
 *
 * - `active` — everything.
 * - `suspended` — read only: members still read their school (learners their courses and
 *   history, staff their screens), nobody changes anything in it.
 * - `closed` — an archive: only the owner still sees the school (to learn when it will be
 *   purged); nobody holds a role in it, so other services treat staff and learners as strangers.
 * - `purged` — a tombstone; nobody sees it.
 */

import type { SchoolLifecycleStatus } from '@ssz/contracts';
import { SchoolNotActiveException } from './exceptions/school-not-active.exception.js';

export type SchoolStatus = SchoolLifecycleStatus;

/** Only an active school may change: roster, invitations, applications, groups, settings. */
export function assertSchoolWritable(schoolId: string, status: SchoolStatus): void {
  if (status !== 'active') throw new SchoolNotActiveException(schoolId, status);
}

/** Whether people keep their roles in the school (members, staff, the owner). */
export function schoolHoldsRoles(status: SchoolStatus): boolean {
  return status === 'active' || status === 'suspended';
}

/** Whether a user who is the owner (or a member) may still read the school at all. */
export function schoolReadableBy(status: SchoolStatus, who: { isOwner: boolean }): boolean {
  if (schoolHoldsRoles(status)) return true;
  return status === 'closed' && who.isOwner;
}
