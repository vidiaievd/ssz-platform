/**
 * Whether a course is still looked after (plan 90, phase 5, Q5).
 *
 * - MAINTAINED: the default.
 * - UNMAINTAINED: "no longer maintained" — still in the catalogue with a badge, new
 *   enrolments allowed (the screen warns).
 * - OBSOLETE: out of the catalogue and search, no new enrolments; learners already on it
 *   carry on. An obsolete course without active learners is cleaned up later (step 4c).
 *
 * Not a publication state and not the archive: it says nothing about what is published.
 */
export enum MaintenanceStatus {
  MAINTAINED = 'maintained',
  UNMAINTAINED = 'unmaintained',
  OBSOLETE = 'obsolete',
}

/**
 * Who set the status last. A school's lifecycle only undoes what it set itself; a status
 * the author chose by hand is theirs to change back.
 */
export enum MaintenanceSource {
  AUTHOR = 'author',
  SCHOOL = 'school',
}
