import { Inject, Injectable } from '@nestjs/common';
import type { $Enums } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  CONTENT_EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../shared/application/ports/event-publisher.port.js';
import { ContainerDeletedEvent } from '../../../container/domain/events/container-deleted.event.js';
import {
  domainMaintenanceSourceToPrisma,
  domainMaintenanceStatusToPrisma,
  prismaMaintenanceSourceToDomain,
  prismaMaintenanceStatusToDomain,
} from '../../../container/infrastructure/persistence/mappers/enum-converters.js';
import type { MaintenanceChange } from '../../domain/school-course-maintenance.js';
import {
  materialKey,
  ownerOf,
  type MaterialEdge,
  type MaterialHold,
  type MaterialKind,
  type MaterialOwner,
  type MaterialRef,
  type SchoolMaterial,
  type SchoolMaterialsGraph,
  type StudiedKind,
} from '../../domain/school-materials.js';
import type {
  DeletedMaterials,
  ISchoolMaterialsStore,
  ObsoleteCourse,
  SchoolCourse,
} from '../../application/ports/school-materials.store.port.js';

/** Rows per delete transaction. */
export const PURGE_BATCH = 100;
/** Ids per `IN (…)` read, far below Postgres' 32 767 bind parameters. */
const READ_CHUNK = 5000;

type StudiedPrismaType = 'CONTAINER' | 'LESSON' | 'VOCABULARY_LIST' | 'GRAMMAR_RULE' | 'EXERCISE';

// Prisma enums carry the member names, never the @map values.
const TO_PRISMA: Record<StudiedKind, StudiedPrismaType> = {
  container: 'CONTAINER',
  lesson: 'LESSON',
  vocabulary_list: 'VOCABULARY_LIST',
  grammar_rule: 'GRAMMAR_RULE',
  exercise: 'EXERCISE',
};
const FROM_PRISMA: Record<string, StudiedKind> = {
  CONTAINER: 'container',
  LESSON: 'lesson',
  VOCABULARY_LIST: 'vocabulary_list',
  GRAMMAR_RULE: 'grammar_rule',
  EXERCISE: 'exercise',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readChunked<T>(
  ids: readonly string[],
  read: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (const chunk of chunks(ids, READ_CHUNK)) out.push(...(await read(chunk)));
  return out;
}

/** The owner's rows: a school's, or an author's own (no school). */
function ownedWhere(owner: MaterialOwner) {
  return owner.kind === 'school'
    ? { ownerSchoolId: owner.schoolId }
    : { ownerSchoolId: null, ownerUserId: owner.userId };
}

/** A container that is not the owner's. */
function notOwnedWhere(owner: MaterialOwner) {
  return owner.kind === 'school'
    ? { OR: [{ ownerSchoolId: null }, { ownerSchoolId: { not: owner.schoolId } }] }
    : { NOT: [{ ownerSchoolId: null, ownerUserId: owner.userId }] };
}

/**
 * The Prisma side of a school's lifecycle in content (plan 90, phase 5, steps 4b–4c). What is kept and
 * why is decided in `domain/school-materials.ts`; this class only reads the graph and deletes.
 */
@Injectable()
export class SchoolMaterialsPrismaStore implements ISchoolMaterialsStore {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER) private readonly events: IEventPublisher,
  ) {}

  async findCourses(schoolId: string): Promise<SchoolCourse[]> {
    const rows = await this.prisma.container.findMany({
      where: { ownerSchoolId: schoolId, containerType: 'COURSE' },
      select: { id: true, maintenanceStatus: true, maintenanceSource: true },
    });
    return rows.map((r) => ({
      id: r.id,
      status: prismaMaintenanceStatusToDomain(r.maintenanceStatus),
      source: prismaMaintenanceSourceToDomain(r.maintenanceSource),
    }));
  }

  async setMaintenance(
    courseIds: readonly string[],
    change: NonNullable<MaintenanceChange>,
    at: Date,
  ): Promise<void> {
    for (const ids of chunks(courseIds, READ_CHUNK)) {
      await this.prisma.container.updateMany({
        where: { id: { in: ids } },
        data: {
          maintenanceStatus: domainMaintenanceStatusToPrisma(change.status),
          maintenanceSource: domainMaintenanceSourceToPrisma(change.source),
          maintenanceChangedAt: at,
        },
      });
    }
  }

  async snapshotSchoolName(schoolId: string, name: string, onlyMissing: boolean): Promise<void> {
    await this.prisma.container.updateMany({
      where: { ownerSchoolId: schoolId, ...(onlyMissing ? { ownerSchoolName: null } : {}) },
      data: { ownerSchoolName: name.slice(0, 200) },
    });
  }

  async findObsoleteCourses(changedBefore: Date): Promise<ObsoleteCourse[]> {
    const rows = await this.prisma.container.findMany({
      where: {
        containerType: 'COURSE',
        maintenanceStatus: 'OBSOLETE',
        OR: [{ maintenanceChangedAt: null }, { maintenanceChangedAt: { lt: changedBefore } }],
      },
      select: { id: true, ownerSchoolId: true, ownerUserId: true },
      orderBy: { maintenanceChangedAt: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, owner: ownerOf(r) }));
  }

  async loadGraph(owner: MaterialOwner, now: Date): Promise<SchoolMaterialsGraph> {
    const owned = ownedWhere(owner);
    // Tags and can-do descriptors have no author of their own: a school's, or nobody's.
    const schoolOwned =
      owner.kind === 'school' ? { ownerSchoolId: owner.schoolId } : { id: { in: [] } };
    const [containers, lessons, lists, rules, exercises, tags, canDo] = await Promise.all([
      this.prisma.container.findMany({ where: owned, select: { id: true, containerType: true } }),
      this.prisma.lesson.findMany({ where: owned, select: { id: true } }),
      this.prisma.vocabularyList.findMany({ where: owned, select: { id: true } }),
      this.prisma.grammarRule.findMany({ where: owned, select: { id: true } }),
      this.prisma.exercise.findMany({ where: owned, select: { id: true } }),
      this.prisma.tag.findMany({ where: schoolOwned, select: { id: true } }),
      this.prisma.canDoDescriptor.findMany({ where: schoolOwned, select: { id: true } }),
    ]);

    const materials: SchoolMaterial[] = [
      ...containers.map((c) => ({
        kind: 'container' as const,
        id: c.id,
        containerType: String(c.containerType).toLowerCase(),
      })),
      ...lessons.map((r) => ({ kind: 'lesson' as const, id: r.id })),
      ...lists.map((r) => ({ kind: 'vocabulary_list' as const, id: r.id })),
      ...rules.map((r) => ({ kind: 'grammar_rule' as const, id: r.id })),
      ...exercises.map((r) => ({ kind: 'exercise' as const, id: r.id })),
      ...tags.map((r) => ({ kind: 'tag' as const, id: r.id })),
      ...canDo.map((r) => ({ kind: 'can_do' as const, id: r.id })),
    ];
    const own = new Set(materials.map(materialKey));
    const isOwn = (ref: MaterialRef) => own.has(materialKey(ref));
    const edges: MaterialEdge[] = [];
    const holds: MaterialHold[] = [];
    // A row of the school points at `to` → an edge; a row of anybody else → `to` is held.
    const link = (from: MaterialRef | null, to: MaterialRef) => {
      if (from && isOwn(from)) edges.push({ from, to });
      else if (isOwn(to)) holds.push({ to, reason: 'foreign_reference' });
    };

    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
    const containerIds = ids(containers);
    const lessonIds = ids(lessons);
    const listIds = ids(lists);
    const ruleIds = ids(rules);
    const exerciseIds = ids(exercises);
    const studiedIds = [...containerIds, ...lessonIds, ...listIds, ...ruleIds, ...exerciseIds];

    // Vocabulary items and rule atoms are addressed one level below their list / rule.
    const schoolItems = await readChunked(listIds, (chunk) =>
      this.prisma.vocabularyItem.findMany({
        where: { vocabularyListId: { in: chunk } },
        select: { id: true, vocabularyListId: true },
      }),
    );
    const schoolAtoms = await readChunked(ruleIds, (chunk) =>
      this.prisma.grammarRuleAtom.findMany({
        where: { grammarRuleId: { in: chunk } },
        select: { id: true, grammarRuleId: true },
      }),
    );
    const listOfItem = new Map(schoolItems.map((i) => [i.id, i.vocabularyListId]));
    const ruleOfAtom = new Map(schoolAtoms.map((a) => [a.id, a.grammarRuleId]));
    const itemIds = schoolItems.map((i) => i.id);

    // 1. Container items: the school's containers → their items; anybody's live container → held.
    for (const row of await readChunked(containerIds, (chunk) =>
      this.prisma.containerItem.findMany({
        where: { containerVersion: { containerId: { in: chunk } } },
        select: {
          itemType: true,
          itemId: true,
          containerVersion: { select: { containerId: true } },
        },
      }),
    )) {
      edges.push({
        from: { kind: 'container', id: row.containerVersion.containerId },
        to: { kind: FROM_PRISMA[row.itemType], id: row.itemId },
      });
    }
    for (const row of await readChunked(studiedIds, (chunk) =>
      this.prisma.containerItem.findMany({
        where: {
          itemId: { in: chunk },
          containerVersion: {
            container: { deletedAt: null, ...notOwnedWhere(owner) },
          },
        },
        select: { itemType: true, itemId: true },
      }),
    )) {
      link(null, { kind: FROM_PRISMA[row.itemType], id: row.itemId });
    }

    // 2. Lesson variants → exercises (listening stages, video questions).
    const lessonExerciseWhere = (lessonChunk: string[], exerciseChunk: string[]) => ({
      OR: [{ variant: { lessonId: { in: lessonChunk } } }, { exerciseId: { in: exerciseChunk } }],
    });
    const stageSelect = { exerciseId: true, variant: { select: { lessonId: true } } } as const;
    for (const [lessonChunk, exerciseChunk] of pairChunks(lessonIds, exerciseIds)) {
      const where = lessonExerciseWhere(lessonChunk, exerciseChunk);
      const [stages, questions] = await Promise.all([
        this.prisma.lessonListeningStage.findMany({ where, select: stageSelect }),
        this.prisma.lessonVideoQuestion.findMany({ where, select: stageSelect }),
      ]);
      for (const row of [...stages, ...questions]) {
        link(
          { kind: 'lesson', id: row.variant.lessonId },
          { kind: 'exercise', id: row.exerciseId },
        );
      }
    }

    // 3. Lesson variants → vocabulary lists (glossary marks) and lists / rules (text spans).
    for (const [lessonChunk, itemChunk] of pairChunks(lessonIds, itemIds)) {
      const marks = await this.prisma.lessonVariantGlossaryMark.findMany({
        where: {
          OR: [
            { variant: { lessonId: { in: lessonChunk } } },
            { vocabularyItemId: { in: itemChunk } },
          ],
        },
        select: {
          variant: { select: { lessonId: true } },
          vocabularyItem: { select: { vocabularyListId: true } },
        },
      });
      for (const row of marks) {
        link(
          { kind: 'lesson', id: row.variant.lessonId },
          { kind: 'vocabulary_list', id: row.vocabularyItem.vocabularyListId },
        );
      }
    }
    const spanTargets = [...itemIds, ...ruleIds];
    const spans: {
      kind: $Enums.LessonSpanKind;
      refId: string | null;
      variant: { lessonId: string };
    }[] = [];
    for (const [lessonChunk, refChunk] of pairChunks(lessonIds, spanTargets)) {
      spans.push(
        ...(await this.prisma.lessonTextSpan.findMany({
          where: {
            refId: { not: null },
            OR: [{ variant: { lessonId: { in: lessonChunk } } }, { refId: { in: refChunk } }],
          },
          select: { kind: true, refId: true, variant: { select: { lessonId: true } } },
        })),
      );
    }
    for (const span of spans) {
      if (!span.refId) continue;
      const from: MaterialRef = { kind: 'lesson', id: span.variant.lessonId };
      if (span.kind === 'GRAMMAR') link(from, { kind: 'grammar_rule', id: span.refId });
      else if (span.kind === 'VOCAB') {
        const listId = listOfItem.get(span.refId);
        if (listId) link(from, { kind: 'vocabulary_list', id: listId });
      }
    }

    // 4. Exercise targets → vocabulary lists / rules (through items and atoms).
    const atomTargets = [...itemIds, ...schoolAtoms.map((a) => a.id)];
    for (const [exerciseChunk, atomChunk] of pairChunks(exerciseIds, atomTargets)) {
      const targets = await this.prisma.exerciseItemTarget.findMany({
        where: {
          atomType: { in: ['VOCABULARY_ITEM', 'GRAMMAR_RULE_ATOM'] },
          OR: [{ exerciseId: { in: exerciseChunk } }, { atomId: { in: atomChunk } }],
        },
        select: { exerciseId: true, atomType: true, atomId: true },
      });
      for (const t of targets) {
        if (!UUID.test(t.atomId)) continue;
        const from: MaterialRef = { kind: 'exercise', id: t.exerciseId };
        const listId = t.atomType === 'VOCABULARY_ITEM' ? listOfItem.get(t.atomId) : undefined;
        const ruleId = t.atomType === 'GRAMMAR_RULE_ATOM' ? ruleOfAtom.get(t.atomId) : undefined;
        if (listId) link(from, { kind: 'vocabulary_list', id: listId });
        if (ruleId) link(from, { kind: 'grammar_rule', id: ruleId });
      }
    }

    // 5. A rule's exercise pool.
    for (const [ruleChunk, exerciseChunk] of pairChunks(ruleIds, exerciseIds)) {
      const pool = await this.prisma.grammarRuleExercisePool.findMany({
        where: {
          OR: [{ grammarRuleId: { in: ruleChunk } }, { exerciseId: { in: exerciseChunk } }],
        },
        select: { grammarRuleId: true, exerciseId: true },
      });
      for (const row of pool)
        link(
          { kind: 'grammar_rule', id: row.grammarRuleId },
          { kind: 'exercise', id: row.exerciseId },
        );
    }

    // 6. Live shares.
    for (const row of await readChunked(studiedIds, (chunk) =>
      this.prisma.contentShare.findMany({
        where: {
          entityId: { in: chunk },
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { entityType: true, entityId: true },
      }),
    )) {
      const to = { kind: FROM_PRISMA[row.entityType], id: row.entityId };
      if (isOwn(to)) holds.push({ to, reason: 'share' });
    }

    // 7. Learners' own words on the school's vocabulary items.
    for (const row of await readChunked(itemIds, (chunk) =>
      this.prisma.personalVocabularyEntry.findMany({
        where: { vocabularyItemId: { in: chunk } },
        select: { vocabularyItemId: true },
        distinct: ['vocabularyItemId'],
      }),
    )) {
      const listId = listOfItem.get(row.vocabularyItemId);
      if (listId)
        holds.push({ to: { kind: 'vocabulary_list', id: listId }, reason: 'personal_word' });
    }

    // 8. The school's tags on materials, and its can-do descriptors they are linked to.
    for (const row of await readChunked(ids(tags), (chunk) =>
      this.prisma.tagAssignment.findMany({
        where: { tagId: { in: chunk } },
        select: { tagId: true, entityType: true, entityId: true },
      }),
    )) {
      link({ kind: FROM_PRISMA[row.entityType], id: row.entityId }, { kind: 'tag', id: row.tagId });
    }
    for (const row of await readChunked(ids(canDo), (chunk) =>
      this.prisma.contentRelation.findMany({
        where: { targetType: 'CAN_DO_DESCRIPTOR', targetId: { in: chunk } },
        select: { sourceType: true, sourceId: true, targetId: true },
      }),
    )) {
      const from = relationSource(row.sourceType, row.sourceId, listOfItem);
      link(from, { kind: 'can_do', id: row.targetId });
    }

    return { materials, edges, holds };
  }

  async deleteMaterials(
    owner: MaterialOwner,
    materials: readonly SchoolMaterial[],
  ): Promise<DeletedMaterials> {
    const owned = ownedWhere(owner);
    const byKind = (kind: MaterialKind) =>
      materials.filter((m) => m.kind === kind).map((m) => m.id);
    const deleted: DeletedMaterials = {
      containers: 0,
      lessons: 0,
      exercises: 0,
      vocabularyLists: 0,
      grammarRules: 0,
      tags: 0,
      canDo: 0,
    };

    // Containers first: their versions name the rest, and learning has to hear about them.
    for (const batch of chunks(byKind('container'), PURGE_BATCH)) {
      const rows = await this.prisma.container.findMany({
        where: { id: { in: batch }, ...owned },
        select: { id: true, ownerUserId: true },
      });
      if (rows.length === 0) continue;
      // Announced before the delete: a crash in between leaves a container that the redelivery
      // deletes and announces again; learning's cascade only touches what is still active.
      for (const row of rows) {
        const event = new ContainerDeletedEvent({
          containerId: row.id,
          ownerUserId: row.ownerUserId,
        });
        await this.events.publish(event.eventType, event);
      }
      const batchIds = rows.map((r) => r.id);
      deleted.containers += await this.prisma.$transaction(async (tx) => {
        await this.deleteDescriptions(tx, 'container', batchIds);
        await tx.contentEntitlement.deleteMany({ where: { containerId: { in: batchIds } } });
        await tx.containerVersion.deleteMany({ where: { containerId: { in: batchIds } } });
        return (
          await tx.container.deleteMany({
            where: { id: { in: batchIds }, ...owned },
          })
        ).count;
      });
    }

    deleted.lessons = await this.deleteStudied('lesson', byKind('lesson'), (tx, b) =>
      tx.lesson.deleteMany({ where: { id: { in: b }, ...owned } }),
    );
    deleted.exercises = await this.deleteStudied('exercise', byKind('exercise'), (tx, b) =>
      tx.exercise.deleteMany({ where: { id: { in: b }, ...owned } }),
    );
    deleted.vocabularyLists = await this.deleteStudied(
      'vocabulary_list',
      byKind('vocabulary_list'),
      async (tx, b) => {
        const items = await tx.vocabularyItem.findMany({
          where: { vocabularyListId: { in: b } },
          select: { id: true },
        });
        await tx.contentRelation.deleteMany({
          where: {
            OR: [
              { sourceType: 'VOCABULARY_ITEM', sourceId: { in: items.map((i) => i.id) } },
              { targetType: 'VOCABULARY_ITEM', targetId: { in: items.map((i) => i.id) } },
            ],
          },
        });
        return tx.vocabularyList.deleteMany({ where: { id: { in: b }, ...owned } });
      },
    );
    deleted.grammarRules = await this.deleteStudied(
      'grammar_rule',
      byKind('grammar_rule'),
      (tx, b) => tx.grammarRule.deleteMany({ where: { id: { in: b }, ...owned } }),
    );

    // Tags and can-do descriptors are a school's only.
    if (owner.kind !== 'school') return deleted;
    const schoolId = owner.schoolId;
    for (const batch of chunks(byKind('tag'), PURGE_BATCH)) {
      // Assignments go with the tag (cascade).
      deleted.tags += (
        await this.prisma.tag.deleteMany({ where: { id: { in: batch }, ownerSchoolId: schoolId } })
      ).count;
    }
    for (const batch of chunks(byKind('can_do'), PURGE_BATCH)) {
      deleted.canDo += await this.prisma.$transaction(async (tx) => {
        await tx.contentRelation.deleteMany({
          where: {
            OR: [
              { sourceType: 'CAN_DO_DESCRIPTOR', sourceId: { in: batch } },
              { targetType: 'CAN_DO_DESCRIPTOR', targetId: { in: batch } },
            ],
          },
        });
        return (
          await tx.canDoDescriptor.deleteMany({
            where: { id: { in: batch }, ownerSchoolId: schoolId },
          })
        ).count;
      });
    }
    return deleted;
  }

  async deleteWorkspaceRows(schoolId: string): Promise<void> {
    await this.prisma.workspaceCoverageRecipe.deleteMany({ where: { schoolId } });
  }

  private async deleteStudied(
    kind: Exclude<StudiedKind, 'container'>,
    ids: readonly string[],
    remove: (tx: Tx, batch: string[]) => Promise<{ count: number }>,
  ): Promise<number> {
    let count = 0;
    for (const batch of chunks(ids, PURGE_BATCH)) {
      count += await this.prisma.$transaction(async (tx) => {
        await this.deleteDescriptions(tx, kind, batch);
        return (await remove(tx, batch)).count;
      });
    }
    return count;
  }

  /** Polymorphic rows about a material (no FK, so no cascade): tags on it, shares, relations, audit. */
  private async deleteDescriptions(tx: Tx, kind: StudiedKind, ids: string[]): Promise<void> {
    const type = TO_PRISMA[kind];
    await tx.tagAssignment.deleteMany({ where: { entityType: type, entityId: { in: ids } } });
    await tx.contentShare.deleteMany({ where: { entityType: type, entityId: { in: ids } } });
    await tx.contentRelation.deleteMany({
      where: {
        OR: [
          { sourceType: type, sourceId: { in: ids } },
          { targetType: type, targetId: { in: ids } },
        ],
      },
    });
    await tx.contentAuditLog.deleteMany({ where: { entityType: type, entityId: { in: ids } } });
  }
}

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** Two id lists read together (`a IN … OR b IN …`), each chunked; an empty side is sent as []. */
function pairChunks(a: readonly string[], b: readonly string[]): Array<[string[], string[]]> {
  const left = chunks(a, READ_CHUNK);
  const right = chunks(b, READ_CHUNK);
  const n = Math.max(left.length, right.length);
  return Array.from(
    { length: n },
    (_, i) => [left[i] ?? [], right[i] ?? []] as [string[], string[]],
  );
}

/** A relation's source as a material: a vocabulary item counts as its list; a can-do as itself. */
function relationSource(
  type: $Enums.RelatableEntityType,
  id: string,
  listOfItem: ReadonlyMap<string, string>,
): MaterialRef | null {
  if (type === 'VOCABULARY_ITEM') {
    const listId = listOfItem.get(id);
    return listId ? { kind: 'vocabulary_list', id: listId } : null;
  }
  if (type === 'CAN_DO_DESCRIPTOR') return { kind: 'can_do', id };
  return FROM_PRISMA[type] ? { kind: FROM_PRISMA[type], id } : null;
}
