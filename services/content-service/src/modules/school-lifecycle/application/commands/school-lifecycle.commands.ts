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

export const SCHOOL_PURGE_SETTINGS = Symbol('SCHOOL_PURGE_SETTINGS');

export interface SchoolPurgeSettings {
  /** A learner who held the content but did nothing in it for longer no longer keeps it (90). */
  activeDays: number;
}
