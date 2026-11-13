import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { onSchoolPurgedKept } from '../../domain/school-course-maintenance.js';
import { planSchoolPurge } from '../../domain/school-materials.js';
import {
  ACTIVE_LEARNERS_READER,
  type IActiveLearnersReader,
} from '../ports/active-learners.reader.port.js';
import {
  SCHOOL_MATERIALS_STORE,
  type DeletedMaterials,
  type ISchoolMaterialsStore,
} from '../ports/school-materials.store.port.js';
import { SCHOOL_PURGE_LEDGER, type ISchoolPurgeLedger } from '../ports/school-purge.ledger.port.js';
import { countByReason, learnerHoldsOn } from './learner-holds.js';
import {
  PurgeSchoolMaterialsCommand,
  SCHOOL_PURGE_SETTINGS,
  type SchoolPurgeSettings,
} from './school-lifecycle.commands.js';
import { applyMaintenanceRule } from './school-maintenance.handlers.js';

export interface PurgeSchoolMaterialsResult {
  kept: number;
  obsoleteCourses: number;
  deleted: DeletedMaterials;
}

/**
 * The school is gone from organization; content keeps what others still use and deletes the rest
 * (plan 90, phase 5, step 4b). Safe to run again: the graph is read afresh, deleted rows are gone,
 * kept courses already `obsolete` are not written twice. Every attempt is written to the purge
 * ledger, so a purge that fails past the consumer's retry is finished by the cleanup job (4c).
 */
@CommandHandler(PurgeSchoolMaterialsCommand)
export class PurgeSchoolMaterialsHandler implements ICommandHandler<
  PurgeSchoolMaterialsCommand,
  PurgeSchoolMaterialsResult
> {
  private readonly logger = new Logger(PurgeSchoolMaterialsHandler.name);

  constructor(
    @Inject(SCHOOL_MATERIALS_STORE) private readonly store: ISchoolMaterialsStore,
    @Inject(ACTIVE_LEARNERS_READER) private readonly learners: IActiveLearnersReader,
    @Inject(SCHOOL_PURGE_LEDGER) private readonly ledger: ISchoolPurgeLedger,
    @Inject(SCHOOL_PURGE_SETTINGS) private readonly settings: SchoolPurgeSettings,
  ) {}

  async execute({
    schoolId,
    schoolName,
  }: PurgeSchoolMaterialsCommand): Promise<PurgeSchoolMaterialsResult> {
    const now = new Date();
    await this.ledger.started(schoolId, schoolName, now);
    try {
      const result = await this.purge(schoolId, schoolName, now);
      await this.ledger.completed(schoolId, new Date());
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The ledger row stays unfinished either way; a failed write only loses the message.
      await this.ledger
        .failed(schoolId, message)
        .catch((e: unknown) =>
          this.logger.warn(`Purge ledger of school ${schoolId} not updated: ${String(e)}`),
        );
      throw err;
    }
  }

  private async purge(
    schoolId: string,
    schoolName: string,
    now: Date,
  ): Promise<PurgeSchoolMaterialsResult> {
    const owner = { kind: 'school', schoolId } as const;
    const graph = await this.store.loadGraph(owner, now);
    // Throws when learning cannot answer: nothing is deleted and the purge is tried again.
    const learnerHolds = await learnerHoldsOn(
      graph.materials,
      graph,
      this.learners,
      now,
      this.settings.activeDays,
    );

    const plan = planSchoolPurge(graph, learnerHolds);

    const kept = new Set(plan.keptCourseIds);
    const keptCourses = (await this.store.findCourses(schoolId)).filter((c) => kept.has(c.id));
    const obsoleteCourses = await applyMaintenanceRule(
      this.store,
      keptCourses,
      onSchoolPurgedKept,
      now,
    );
    if (plan.kept.length > 0) await this.store.snapshotSchoolName(schoolId, schoolName, true);

    const deleted = await this.store.deleteMaterials(owner, plan.deleted);
    await this.store.deleteWorkspaceRows(schoolId);

    this.logger.log(
      `School ${schoolId} purged: kept ${plan.kept.length} material(s) (${keptCourses.length} course(s), ` +
        `${obsoleteCourses} newly obsolete; holds: ${countByReason([...graph.holds, ...learnerHolds])}), ` +
        `deleted ${JSON.stringify(deleted)}`,
    );
    return { kept: plan.kept.length, obsoleteCourses, deleted };
  }
}
