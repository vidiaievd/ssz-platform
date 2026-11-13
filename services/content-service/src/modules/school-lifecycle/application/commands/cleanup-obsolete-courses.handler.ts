import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  cleanupCandidates,
  ownerKey,
  planObsoleteCleanup,
  type MaterialOwner,
} from '../../domain/school-materials.js';
import {
  ACTIVE_LEARNERS_READER,
  type IActiveLearnersReader,
} from '../ports/active-learners.reader.port.js';
import {
  SCHOOL_MATERIALS_STORE,
  type ISchoolMaterialsStore,
} from '../ports/school-materials.store.port.js';
import { countByReason, learnerHoldsOn } from './learner-holds.js';
import {
  CleanupObsoleteCoursesCommand,
  SCHOOL_PURGE_SETTINGS,
  type SchoolPurgeSettings,
} from './school-lifecycle.commands.js';

const HOUR_MS = 60 * 60 * 1000;

export interface CleanupObsoleteCoursesResult {
  /** Obsolete courses past the grace period that were looked at. */
  courses: number;
  deletedCourses: number;
  /** Other materials deleted with them (lessons, exercises, lists, rules, tags, can-do). */
  deletedOther: number;
  /** Owners whose cleanup failed (learning silent, a database error) — tried again next run. */
  failedOwners: number;
}

/**
 * Obsolete courses nobody holds go, with whatever of their owner only they used (plan 90, phase
 * 5, step 4c; Q5). Any source: a purged school's kept course once its last learner is quiet, or
 * a course its author retired. What holds a course or a piece of it is the purge's rule — an
 * active learner, a live share, a row of anybody else, a learner's own word — plus the owner's
 * other materials. Owner by owner: one failure never stops the rest, and nothing of an owner is
 * deleted when learning cannot answer.
 */
@CommandHandler(CleanupObsoleteCoursesCommand)
export class CleanupObsoleteCoursesHandler implements ICommandHandler<
  CleanupObsoleteCoursesCommand,
  CleanupObsoleteCoursesResult
> {
  private readonly logger = new Logger(CleanupObsoleteCoursesHandler.name);

  constructor(
    @Inject(SCHOOL_MATERIALS_STORE) private readonly store: ISchoolMaterialsStore,
    @Inject(ACTIVE_LEARNERS_READER) private readonly learners: IActiveLearnersReader,
    @Inject(SCHOOL_PURGE_SETTINGS) private readonly settings: SchoolPurgeSettings,
  ) {}

  async execute(): Promise<CleanupObsoleteCoursesResult> {
    const now = new Date();
    const courses = await this.store.findObsoleteCourses(
      new Date(now.getTime() - this.settings.obsoleteGraceHours * HOUR_MS),
    );
    const byOwner = new Map<string, { owner: MaterialOwner; ids: string[] }>();
    for (const course of courses) {
      const key = ownerKey(course.owner);
      const group = byOwner.get(key);
      if (group) group.ids.push(course.id);
      else byOwner.set(key, { owner: course.owner, ids: [course.id] });
    }

    const result: CleanupObsoleteCoursesResult = {
      courses: courses.length,
      deletedCourses: 0,
      deletedOther: 0,
      failedOwners: 0,
    };
    for (const [key, { owner, ids }] of byOwner) {
      try {
        const deleted = await this.cleanup(owner, ids, now);
        result.deletedCourses += deleted.courses;
        result.deletedOther += deleted.other;
      } catch (err) {
        result.failedOwners += 1;
        this.logger.error(
          `Obsolete cleanup of ${key} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (courses.length > 0) this.logger.log(`Obsolete cleanup: ${JSON.stringify(result)}`);
    return result;
  }

  private async cleanup(
    owner: MaterialOwner,
    courseIds: string[],
    now: Date,
  ): Promise<{ courses: number; other: number }> {
    const graph = await this.store.loadGraph(owner, now);
    const learnerHolds = await learnerHoldsOn(
      cleanupCandidates(graph, courseIds),
      graph,
      this.learners,
      now,
      this.settings.activeDays,
    );
    const plan = planObsoleteCleanup(graph, courseIds, learnerHolds);
    if (plan.deleted.length === 0) return { courses: 0, other: 0 };

    const deleted = await this.store.deleteMaterials(owner, plan.deleted);
    const other =
      deleted.lessons +
      deleted.exercises +
      deleted.vocabularyLists +
      deleted.grammarRules +
      deleted.tags +
      deleted.canDo;
    this.logger.log(
      `Obsolete cleanup of ${ownerKey(owner)}: ${courseIds.length} course(s) looked at, kept ` +
        `${plan.keptCourseIds.length} (holds: ${countByReason(learnerHolds)}), deleted ${JSON.stringify(deleted)}`,
    );
    return { courses: deleted.containers, other };
  }
}
