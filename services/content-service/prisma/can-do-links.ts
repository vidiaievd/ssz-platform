/**
 * The two edges that wake the can-do tract up (plan 55, phase 7.2).
 *
 * A module says which words it introduces and which CEFR "I can…" statements it
 * actually trains, and the learning service walks exactly those two edges: from a
 * practised atom back to the modules that introduce it, and from a module forward
 * to the descriptors it targets. Both seeds need the same two, so they live here
 * instead of being written twice.
 *
 * The descriptors themselves come from `seed-can-do.ts`, which has to have run first:
 * these are links to a library, not a second copy of it.
 */
import type { PrismaClient } from '../generated/prisma/client.js';
import type { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { GetContainerCoverageHandler } from '../src/modules/container/application/queries/get-container-coverage/get-container-coverage.handler.js';
import { PrismaExerciseAxesService } from '../src/shared/skills/infrastructure/prisma-exercise-axes.service.js';

/** Only the four CEFR skills exist as an axis and as a descriptor dimension alike. */
type CanDoSkill = 'LISTENING' | 'READING' | 'SPOKEN' | 'WRITTEN';

const SKILL_BY_COVERAGE_KEY: Record<string, CanDoSkill> = {
  listening: 'LISTENING',
  reading: 'READING',
  spoken: 'SPOKEN',
  written: 'WRITTEN',
};

export interface ModuleLink {
  /** The module container. */
  containerId: string;
  title: string;
  /** Every vocabulary item the module's «Nye ord» sections put in front of the learner. */
  vocabularyItemIds: string[];
}

export interface CanDoLinkOptions {
  /** The course's CEFR level; descriptors are picked from the same band. */
  level: 'A1' | 'A2' | 'B1' | 'B2';
  modules: ModuleLink[];
  createdByUserId: string;
  ownerSchoolId: string;
}

/**
 * Links every module to the words it introduces and to the can-do statements its
 * exercises really train.
 *
 * `TARGETS` is decided by the coverage report, not by the module's title: a module
 * whose exercises are all reading gets the reading descriptor and nothing else, and a
 * module with no exercises at all gets nothing. That is the point of the report — a
 * title claims, and the report measures. Both edge sets are reconciled rather than
 * appended, so a module that loses its written exercises loses the written descriptor
 * on the next run, the same way glossary marks follow an edited body text.
 */
export async function linkModulesToCanDo(
  prisma: PrismaClient,
  options: CanDoLinkOptions,
): Promise<{ targets: number; introduces: number; modulesWithoutTargets: string[] }> {
  const descriptors = await prisma.canDoDescriptor.findMany({
    where: { cefrLevel: options.level, scope: 'GLOBAL', ownerSchoolId: null, deletedAt: null },
    select: { id: true, skill: true },
  });

  if (descriptors.length === 0) {
    throw new Error(
      `No GLOBAL can-do descriptors for ${options.level}. Run "npx tsx prisma/seed-can-do.ts" first.`,
    );
  }

  const descriptorBySkill = new Map<CanDoSkill, string>(
    descriptors.map((d: { id: string; skill: CanDoSkill }) => [d.skill, d.id]),
  );

  const coverage = new GetContainerCoverageHandler(
    prisma as PrismaService,
    new PrismaExerciseAxesService(prisma as PrismaService),
  );

  let targets = 0;
  let introduces = 0;
  const modulesWithoutTargets: string[] = [];

  for (const mod of options.modules) {
    const report = await coverage.execute({
      containerId: mod.containerId,
      version: 'published',
    } as never);

    const wanted = new Set<string>();
    if (report.isOk && report.value.published?.available === true) {
      for (const [key, count] of Object.entries(report.value.published.coverage.bySkill)) {
        if ((count as number) === 0) continue;
        const descriptorId = descriptorBySkill.get(SKILL_BY_COVERAGE_KEY[key]);
        if (descriptorId) wanted.add(descriptorId);
      }
    }
    if (wanted.size === 0) modulesWithoutTargets.push(mod.title);

    targets += await reconcile(prisma, options, mod.containerId, 'TARGETS', 'CAN_DO_DESCRIPTOR', wanted);
    introduces += await reconcile(
      prisma,
      options,
      mod.containerId,
      'INTRODUCES',
      'VOCABULARY_ITEM',
      new Set(mod.vocabularyItemIds),
    );
  }

  return { targets, introduces, modulesWithoutTargets };
}

/** Makes the rows of one (module, kind, target type) triple equal to `wanted`. */
async function reconcile(
  prisma: PrismaClient,
  options: CanDoLinkOptions,
  containerId: string,
  relationKind: 'TARGETS' | 'INTRODUCES',
  targetType: 'CAN_DO_DESCRIPTOR' | 'VOCABULARY_ITEM',
  wanted: Set<string>,
): Promise<number> {
  const existing: { id: string; targetId: string }[] = await prisma.contentRelation.findMany({
    where: { sourceType: 'CONTAINER', sourceId: containerId, relationKind, targetType },
    select: { id: true, targetId: true },
  });

  const have = new Set(existing.map((r) => r.targetId));
  const stale = existing.filter((r) => !wanted.has(r.targetId)).map((r) => r.id);

  if (stale.length > 0) {
    await prisma.contentRelation.deleteMany({ where: { id: { in: stale } } });
  }

  const missing = [...wanted].filter((targetId) => !have.has(targetId));
  if (missing.length > 0) {
    await prisma.contentRelation.createMany({
      data: missing.map((targetId) => ({
        sourceType: 'CONTAINER',
        sourceId: containerId,
        targetType,
        targetId,
        relationKind,
        ownerSchoolId: options.ownerSchoolId,
        createdByUserId: options.createdByUserId,
      })),
      skipDuplicates: true,
    });
  }

  return wanted.size;
}
