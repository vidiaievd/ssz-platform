import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetModuleReaderStructureQuery } from './get-module-reader-structure.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { ContainerItemType } from '../../../../container/domain/value-objects/item-type.vo.js';
import { LessonKind } from '../../../../lesson/domain/value-objects/lesson-kind.vo.js';
import { prismaLessonKindToDomain } from '../../../../lesson/infrastructure/persistence/mappers/enum-converters.js';
import { prismaItemTypeToDomain } from '../../../../container/infrastructure/persistence/mappers/enum-converters.js';
import type { $Enums } from '../../../../../../generated/prisma/client.js';

export interface ReaderStructureItemNode {
  id: string;
  itemType: ContainerItemType;
  refId: string;
  title: string | null;
  position: number;
  lessonKind: LessonKind | null;
  // Best-effort from any PUBLISHED variant/explanation (LESSON/GRAMMAR_RULE) or
  // the item's own estimate (EXERCISE); null for VOCABULARY_LIST (no single
  // natural read-time metric).
  durationMinutes: number | null;
  xpReward: number | null;
}

export interface ReaderStructureSectionNode {
  id: string;
  title: string;
  position: number;
  items: ReaderStructureItemNode[];
}

export interface ModuleReaderStructureResult {
  moduleId: string;
  moduleTitle: string | null;
  sections: ReaderStructureSectionNode[];
  ungroupedItems: ReaderStructureItemNode[];
}

@QueryHandler(GetModuleReaderStructureQuery)
export class GetModuleReaderStructureHandler implements IQueryHandler<
  GetModuleReaderStructureQuery,
  ModuleReaderStructureResult
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetModuleReaderStructureQuery): Promise<ModuleReaderStructureResult> {
    const module = await this.prisma.container.findUnique({
      where: { id: query.moduleId, deletedAt: null },
      select: { id: true, title: true, currentPublishedVersionId: true },
    });
    if (!module) throw new NotFoundException(`Module ${query.moduleId} not found`);

    if (!module.currentPublishedVersionId) {
      return { moduleId: module.id, moduleTitle: module.title, sections: [], ungroupedItems: [] };
    }

    const [sections, items] = await Promise.all([
      this.prisma.containerSection.findMany({
        where: { containerVersionId: module.currentPublishedVersionId },
        orderBy: { position: 'asc' },
      }),
      this.prisma.containerItem.findMany({
        where: { containerVersionId: module.currentPublishedVersionId },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          itemType: true,
          itemId: true,
          position: true,
          sectionId: true,
          xpReward: true,
        },
      }),
    ]);

    const metaByRefId = await this.resolveItemMeta(items);

    const toNode = (item: (typeof items)[number]): ReaderStructureItemNode => {
      const meta = metaByRefId.get(item.itemId);
      return {
        id: item.id,
        itemType: prismaItemTypeToDomain(item.itemType),
        refId: item.itemId,
        title: meta?.title ?? null,
        position: item.position,
        lessonKind: meta?.lessonKind ?? null,
        durationMinutes: meta?.durationMinutes ?? null,
        xpReward: item.xpReward,
      };
    };

    const sectionNodes: ReaderStructureSectionNode[] = sections.map((section) => ({
      id: section.id,
      title: section.title,
      position: section.position,
      items: items
        .filter((i) => i.sectionId === section.id)
        .sort((a, b) => a.position - b.position)
        .map(toNode),
    }));

    const ungroupedItems = items
      .filter((i) => i.sectionId === null)
      .sort((a, b) => a.position - b.position)
      .map(toNode);

    return {
      moduleId: module.id,
      moduleTitle: module.title,
      sections: sectionNodes,
      ungroupedItems,
    };
  }

  // Batched title/kind/duration resolution grouped by itemType, mirroring
  // GetCurriculumTreeHandler's resolveLeafItemMeta.
  private async resolveItemMeta(
    items: { itemType: $Enums.ContainerItemType; itemId: string }[],
  ): Promise<
    Map<
      string,
      { title: string | null; lessonKind: LessonKind | null; durationMinutes: number | null }
    >
  > {
    const meta = new Map<
      string,
      { title: string | null; lessonKind: LessonKind | null; durationMinutes: number | null }
    >();

    const idsByType = new Map<ContainerItemType, string[]>();
    for (const item of items) {
      const domainType = prismaItemTypeToDomain(item.itemType);
      const ids = idsByType.get(domainType) ?? [];
      ids.push(item.itemId);
      idsByType.set(domainType, ids);
    }

    const lessonIds = idsByType.get(ContainerItemType.LESSON) ?? [];
    if (lessonIds.length > 0) {
      const [lessons, variants] = await Promise.all([
        this.prisma.lesson.findMany({
          where: { id: { in: lessonIds } },
          select: { id: true, title: true, kind: true },
        }),
        this.prisma.lessonContentVariant.findMany({
          where: { lessonId: { in: lessonIds }, status: 'PUBLISHED' },
          select: { lessonId: true, estimatedReadingMinutes: true },
        }),
      ]);

      const durationByLessonId = new Map<string, number>();
      for (const v of variants) {
        if (v.estimatedReadingMinutes == null) continue;
        const current = durationByLessonId.get(v.lessonId);
        if (current === undefined) durationByLessonId.set(v.lessonId, v.estimatedReadingMinutes);
      }

      for (const lesson of lessons) {
        meta.set(lesson.id, {
          title: lesson.title,
          lessonKind: prismaLessonKindToDomain(lesson.kind),
          durationMinutes: durationByLessonId.get(lesson.id) ?? null,
        });
      }
    }

    const vocabularyListIds = idsByType.get(ContainerItemType.VOCABULARY_LIST) ?? [];
    if (vocabularyListIds.length > 0) {
      const rows = await this.prisma.vocabularyList.findMany({
        where: { id: { in: vocabularyListIds } },
        select: { id: true, title: true },
      });
      rows.forEach((r) =>
        meta.set(r.id, { title: r.title, lessonKind: null, durationMinutes: null }),
      );
    }

    const grammarRuleIds = idsByType.get(ContainerItemType.GRAMMAR_RULE) ?? [];
    if (grammarRuleIds.length > 0) {
      const [rules, explanations] = await Promise.all([
        this.prisma.grammarRule.findMany({
          where: { id: { in: grammarRuleIds } },
          select: { id: true, title: true },
        }),
        this.prisma.grammarRuleExplanation.findMany({
          where: { grammarRuleId: { in: grammarRuleIds }, status: 'PUBLISHED' },
          select: { grammarRuleId: true, estimatedReadingMinutes: true },
        }),
      ]);

      const durationByRuleId = new Map<string, number>();
      for (const e of explanations) {
        if (e.estimatedReadingMinutes == null) continue;
        const current = durationByRuleId.get(e.grammarRuleId);
        if (current === undefined) durationByRuleId.set(e.grammarRuleId, e.estimatedReadingMinutes);
      }

      rules.forEach((r) =>
        meta.set(r.id, {
          title: r.title,
          lessonKind: null,
          durationMinutes: durationByRuleId.get(r.id) ?? null,
        }),
      );
    }

    const exerciseIds = idsByType.get(ContainerItemType.EXERCISE) ?? [];
    if (exerciseIds.length > 0) {
      const rows = await this.prisma.exercise.findMany({
        where: { id: { in: exerciseIds } },
        select: { id: true, estimatedDurationSeconds: true, template: { select: { name: true } } },
      });
      rows.forEach((r) =>
        meta.set(r.id, {
          title: r.template.name ?? null,
          lessonKind: null,
          durationMinutes:
            r.estimatedDurationSeconds != null ? Math.ceil(r.estimatedDurationSeconds / 60) : null,
        }),
      );
    }

    return meta;
  }
}
