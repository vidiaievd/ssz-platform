import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { onSchoolPurgedKept } from '../../domain/school-course-maintenance.js';
import {
  leafIdsOf,
  materialKey,
  planSchoolPurge,
  type MaterialHold,
  type StudiedKind,
} from '../../domain/school-materials.js';
import {
  ACTIVE_LEARNERS_READER,
  type ActiveLearnersQuestion,
  type IActiveLearnersReader,
} from '../ports/active-learners.reader.port.js';
import {
  SCHOOL_MATERIALS_STORE,
  type DeletedMaterials,
  type ISchoolMaterialsStore,
} from '../ports/school-materials.store.port.js';
import {
  PurgeSchoolMaterialsCommand,
  SCHOOL_PURGE_SETTINGS,
  type SchoolPurgeSettings,
} from './school-lifecycle.commands.js';
import { applyMaintenanceRule } from './school-maintenance.handlers.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STUDIED: ReadonlySet<string> = new Set<StudiedKind>([
  'container',
  'lesson',
  'vocabulary_list',
  'grammar_rule',
  'exercise',
]);

export interface PurgeSchoolMaterialsResult {
  kept: number;
  obsoleteCourses: number;
  deleted: DeletedMaterials;
}

/**
 * The school is gone from organization; content keeps what others still use and deletes the rest
 * (plan 90, phase 5, step 4b). Safe to run again: the graph is read afresh, deleted rows are gone,
 * kept courses already `obsolete` are not written twice.
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
    @Inject(SCHOOL_PURGE_SETTINGS) private readonly settings: SchoolPurgeSettings,
  ) {}

  async execute({
    schoolId,
    schoolName,
  }: PurgeSchoolMaterialsCommand): Promise<PurgeSchoolMaterialsResult> {
    const now = new Date();
    const graph = await this.store.loadGraph(schoolId, now);

    const questions: ActiveLearnersQuestion[] = graph.materials
      .filter((m) => STUDIED.has(m.kind))
      .map((m) => ({
        kind: m.kind as StudiedKind,
        id: m.id,
        leafIds: m.kind === 'container' ? leafIdsOf(m.id, graph) : [],
      }));
    // Throws when learning cannot answer: nothing is deleted and the event is retried.
    const active = await this.learners.countActive(
      questions,
      new Date(now.getTime() - this.settings.activeDays * DAY_MS),
    );
    const learnerHolds: MaterialHold[] = questions
      .filter((q) => (active.get(materialKey({ kind: q.kind, id: q.id })) ?? 0) > 0)
      .map((q) => ({ to: { kind: q.kind, id: q.id }, reason: 'active_learner' }));

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

    const deleted = await this.store.deleteMaterials(schoolId, plan.deleted);
    await this.store.deleteWorkspaceRows(schoolId);

    this.logger.log(
      `School ${schoolId} purged: kept ${plan.kept.length} material(s) (${keptCourses.length} course(s), ` +
        `${obsoleteCourses} newly obsolete; holds: ${countByReason([...graph.holds, ...learnerHolds])}), ` +
        `deleted ${JSON.stringify(deleted)}`,
    );
    return { kept: plan.kept.length, obsoleteCourses, deleted };
  }
}

function countByReason(holds: readonly MaterialHold[]): string {
  const counts = new Map<string, number>();
  for (const h of holds) counts.set(h.reason, (counts.get(h.reason) ?? 0) + 1);
  return [...counts].map(([r, n]) => `${r}=${n}`).join(', ') || 'none';
}
