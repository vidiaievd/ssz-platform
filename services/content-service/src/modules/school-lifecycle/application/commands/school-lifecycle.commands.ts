/** `school.closed`: the school's courses become `unmaintained`, its name is kept for the byline. */
export class ApplySchoolClosedCommand {
  constructor(
    readonly schoolId: string,
    readonly schoolName: string,
  ) {}
}

/** `school.restored`: what the school's closing set goes back to `maintained`. */
export class ApplySchoolRestoredCommand {
  constructor(readonly schoolId: string) {}
}

/** `school.purged`: what others still use stays (`obsolete` for courses), the rest is deleted. */
export class PurgeSchoolMaterialsCommand {
  constructor(
    readonly schoolId: string,
    readonly schoolName: string,
  ) {}
}

/** Obsolete courses nobody holds are deleted with what only they used (step 4c). */
export class CleanupObsoleteCoursesCommand {}

/**
 * The cleanup job's run (step 4c): unfinished school purges again, then obsolete courses — under
 * one lock across instances.
 */
export class RunContentCleanupCommand {}

export const SCHOOL_PURGE_SETTINGS = Symbol('SCHOOL_PURGE_SETTINGS');

export interface SchoolPurgeSettings {
  /** A learner who held the content but did nothing in it for longer no longer keeps it (90). */
  activeDays: number;
  /**
   * An `obsolete` course is left alone this long after its status was set, so an author's slip
   * can be taken back before anything is deleted (24; 0 = at the next run).
   */
  obsoleteGraceHours: number;
  /** An unfinished purge whose last attempt began longer ago is run again (30 min). */
  purgeRetryAfterMs: number;
}
