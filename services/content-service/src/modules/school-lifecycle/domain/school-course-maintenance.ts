import {
  MaintenanceSource,
  MaintenanceStatus,
} from '../../container/domain/value-objects/maintenance-status.vo.js';

/**
 * What a school's lifecycle does to the maintenance status of its courses (plan 90, phase 5, Q5).
 * Pure: the store loads each course's status and source, asks these rules, and writes the answers.
 *
 * - `school.closed` → every `maintained` course becomes `unmaintained` (source `school`). A course
 *   the author has already marked keeps the author's status — and the author as its source, so the
 *   school's restore leaves it alone.
 * - `school.restored` → only what the school set (`unmaintained`, source `school`) goes back to
 *   `maintained`. An author who changed the status in between (even to the same value) owns it.
 * - `school.purged` → a course kept because others still use it becomes `obsolete` (source
 *   `school`), whatever it was; courses nobody uses are deleted instead.
 */
export interface CourseMaintenance {
  status: MaintenanceStatus;
  source: MaintenanceSource | null;
}

/** null — nothing to write. */
export type MaintenanceChange = { status: MaintenanceStatus; source: MaintenanceSource } | null;

export function onSchoolClosed(course: CourseMaintenance): MaintenanceChange {
  if (course.status !== MaintenanceStatus.MAINTAINED) return null;
  return { status: MaintenanceStatus.UNMAINTAINED, source: MaintenanceSource.SCHOOL };
}

export function onSchoolRestored(course: CourseMaintenance): MaintenanceChange {
  if (
    course.source !== MaintenanceSource.SCHOOL ||
    course.status !== MaintenanceStatus.UNMAINTAINED
  )
    return null;
  return { status: MaintenanceStatus.MAINTAINED, source: MaintenanceSource.SCHOOL };
}

export function onSchoolPurgedKept(course: CourseMaintenance): MaintenanceChange {
  if (course.status === MaintenanceStatus.OBSOLETE) return null;
  return { status: MaintenanceStatus.OBSOLETE, source: MaintenanceSource.SCHOOL };
}
