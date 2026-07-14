import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCurriculumTreeQuery } from './get-curriculum-tree.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';
import { LevelSystem } from '../../../domain/value-objects/level-system.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import type { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { LessonKind } from '../../../../lesson/domain/value-objects/lesson-kind.vo.js';
import { prismaLessonKindToDomain } from '../../../../lesson/infrastructure/persistence/mappers/enum-converters.js';

export interface CurriculumTreeItemNode {
  id: string;
  itemType: ContainerItemType;
  refId: string;
  title: string | null;
  position: number;
  isRequired: boolean;
  lessonKind: LessonKind | null;
  // Best-effort, currently derived only for LESSON items (any published variant
  // → published, else draft). Other item types have no draft/published workflow
  // of their own yet. Teacher join arrives in Phase BE4.2.
  state: 'draft' | 'published' | null;
  // Best-effort from any PUBLISHED variant/explanation (LESSON/GRAMMAR_RULE) or
  // the item's own estimate (EXERCISE); null for VOCABULARY_LIST.
  durationMinutes: number | null;
  xpReward: number | null;
}

export interface CurriculumTreeSectionNode {
  id: string;
  title: string;
  position: number;
  items: CurriculumTreeItemNode[];
}

export interface CurriculumTreeModuleNode {
  id: string;
  containerId: string;
  versionId: string | null;
  title: string | null;
  titleEn: string | null;
  position: number;
  isRequired: boolean;
  sections: CurriculumTreeSectionNode[];
  ungroupedItems: CurriculumTreeItemNode[];
}

export interface CurriculumTreeLevelNode {
  id: string | null;
  title: string | null;
  position: number;
  modules: CurriculumTreeModuleNode[];
}

export interface CurriculumTreeResult {
  versionId: string;
  containerId: string;
  levelSystem: LevelSystem;
  levels: CurriculumTreeLevelNode[];
}

const UNGROUPED_LEVEL_ID = null;

@QueryHandler(GetCurriculumTreeQuery)
export class GetCurriculumTreeHandler implements IQueryHandler<
  GetCurriculumTreeQuery,
  Result<CurriculumTreeResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_SECTION_REPOSITORY)
    private readonly sectionRepo: IContainerSectionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    query: GetCurriculumTreeQuery,
  ): Promise<Result<CurriculumTreeResult, ContainerDomainError>> {
    const version = await this.versionRepo.findById(query.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const container = await this.containerRepo.findById(version.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const [levelSections, topItems] = await Promise.all([
      this.sectionRepo.findByVersionId(query.versionId),
      this.itemRepo.findByVersionId(query.versionId),
    ]);

    // Only CONTAINER-type items represent modules in the curriculum tree
    // (decision: Level(section) → Module(container item) → Section → Item).
    const moduleItems = topItems.filter((i) => i.itemType === ContainerItemType.CONTAINER);
    const moduleNodes = await this.buildModuleNodes(moduleItems);
    const moduleNodeById = new Map(moduleNodes.map((m) => [m.id, m]));

    const levels: CurriculumTreeLevelNode[] = levelSections
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((section) => ({
        id: section.id,
        title: section.title,
        position: section.position,
        modules: moduleItems
          .filter((i) => i.sectionId === section.id)
          .sort((a, b) => a.position - b.position)
          .map((i) => moduleNodeById.get(i.id))
          .filter((m): m is CurriculumTreeModuleNode => m !== undefined),
      }));

    const ungroupedModules = moduleItems
      .filter((i) => i.sectionId === null)
      .sort((a, b) => a.position - b.position)
      .map((i) => moduleNodeById.get(i.id))
      .filter((m): m is CurriculumTreeModuleNode => m !== undefined);

    if (ungroupedModules.length > 0) {
      levels.push({
        id: UNGROUPED_LEVEL_ID,
        title: null,
        position: levels.length,
        modules: ungroupedModules,
      });
    }

    return Result.ok({
      versionId: version.id,
      containerId: container.id,
      levelSystem: container.levelSystem,
      levels,
    });
  }

  private async buildModuleNodes(
    moduleItems: ContainerItemEntity[],
  ): Promise<CurriculumTreeModuleNode[]> {
    if (moduleItems.length === 0) return [];

    const moduleContainerIds = moduleItems.map((i) => i.itemId);

    const [containers, localizations, versionCandidates] = await Promise.all([
      this.prisma.container.findMany({
        where: { id: { in: moduleContainerIds } },
        select: { id: true, title: true },
      }),
      this.prisma.containerLocalization.findMany({
        where: { containerId: { in: moduleContainerIds }, languageCode: 'en' },
        select: { containerId: true, title: true },
      }),
      this.prisma.containerVersion.findMany({
        where: { containerId: { in: moduleContainerIds }, status: { in: ['DRAFT', 'PUBLISHED'] } },
        select: { id: true, containerId: true, status: true },
      }),
    ]);

    const containerById = new Map(containers.map((c) => [c.id, c]));
    const titleEnByContainerId = new Map(localizations.map((l) => [l.containerId, l.title]));

    // Prefer the draft version for authoring; fall back to published when no draft exists.
    const chosenVersionByContainerId = new Map<string, { id: string }>();
    for (const v of versionCandidates) {
      const current = chosenVersionByContainerId.get(v.containerId);
      if (!current || v.status === 'DRAFT') {
        chosenVersionByContainerId.set(v.containerId, { id: v.id });
      }
    }

    const moduleVersionIds = [...chosenVersionByContainerId.values()].map((v) => v.id);

    const [sectionsByModuleVersion, itemsByModuleVersion] = await Promise.all([
      Promise.all(moduleVersionIds.map((id) => this.sectionRepo.findByVersionId(id))),
      Promise.all(moduleVersionIds.map((id) => this.itemRepo.findByVersionId(id))),
    ]);

    const sectionsByVersionId = new Map(
      moduleVersionIds.map((id, idx) => [id, sectionsByModuleVersion[idx]]),
    );
    const leafItemsByVersionId = new Map(
      moduleVersionIds.map((id, idx) => [id, itemsByModuleVersion[idx]]),
    );

    const allLeafItems = itemsByModuleVersion.flat();
    const leafMetaByRefId = await this.resolveLeafItemMeta(allLeafItems);

    return moduleItems.map((moduleItem) => {
      const moduleContainerId = moduleItem.itemId;
      const chosenVersion = chosenVersionByContainerId.get(moduleContainerId) ?? null;
      const sections = chosenVersion ? (sectionsByVersionId.get(chosenVersion.id) ?? []) : [];
      const leafItems = chosenVersion ? (leafItemsByVersionId.get(chosenVersion.id) ?? []) : [];

      const toNode = (item: ContainerItemEntity): CurriculumTreeItemNode => {
        const meta = leafMetaByRefId.get(item.itemId);
        return {
          id: item.id,
          itemType: item.itemType,
          refId: item.itemId,
          title: meta?.title ?? null,
          position: item.position,
          isRequired: item.isRequired,
          lessonKind: meta?.lessonKind ?? null,
          state: meta?.state ?? null,
          durationMinutes: meta?.durationMinutes ?? null,
          xpReward: item.xpReward,
        };
      };

      const sectionNodes: CurriculumTreeSectionNode[] = sections
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((section) => ({
          id: section.id,
          title: section.title,
          position: section.position,
          items: leafItems
            .filter((i) => i.sectionId === section.id)
            .sort((a, b) => a.position - b.position)
            .map(toNode),
        }));

      const ungroupedItems = leafItems
        .filter((i) => i.sectionId === null)
        .sort((a, b) => a.position - b.position)
        .map(toNode);

      return {
        id: moduleItem.id,
        containerId: moduleContainerId,
        versionId: chosenVersion?.id ?? null,
        title: containerById.get(moduleContainerId)?.title ?? null,
        titleEn: titleEnByContainerId.get(moduleContainerId) ?? null,
        position: moduleItem.position,
        isRequired: moduleItem.isRequired,
        sections: sectionNodes,
        ungroupedItems,
      };
    });
  }

  // Batched title/kind/state resolution for leaf items across every module in the tree,
  // grouped by itemType to avoid one round-trip per item (mirrors GetVersionItemsHandler).
  private async resolveLeafItemMeta(items: ContainerItemEntity[]): Promise<
    Map<
      string,
      {
        title: string | null;
        lessonKind: LessonKind | null;
        state: 'draft' | 'published' | null;
        durationMinutes: number | null;
      }
    >
  > {
    const meta = new Map<
      string,
      {
        title: string | null;
        lessonKind: LessonKind | null;
        state: 'draft' | 'published' | null;
        durationMinutes: number | null;
      }
    >();

    const idsByType = new Map<ContainerItemType, string[]>();
    for (const item of items) {
      const ids = idsByType.get(item.itemType) ?? [];
      ids.push(item.itemId);
      idsByType.set(item.itemType, ids);
    }

    const lessonRefIds = idsByType.get(ContainerItemType.LESSON) ?? [];
    if (lessonRefIds.length > 0) {
      const [lessons, variants] = await Promise.all([
        this.prisma.lesson.findMany({
          where: { id: { in: lessonRefIds } },
          select: { id: true, title: true, kind: true },
        }),
        this.prisma.lessonContentVariant.findMany({
          where: { lessonId: { in: lessonRefIds } },
          select: { lessonId: true, status: true, estimatedReadingMinutes: true },
        }),
      ]);

      const hasPublishedVariant = new Set(
        variants.filter((v) => v.status === 'PUBLISHED').map((v) => v.lessonId),
      );
      const hasAnyVariant = new Set(variants.map((v) => v.lessonId));

      const durationByLessonId = new Map<string, number>();
      for (const v of variants) {
        if (v.status !== 'PUBLISHED' || v.estimatedReadingMinutes == null) continue;
        const current = durationByLessonId.get(v.lessonId);
        if (current === undefined) durationByLessonId.set(v.lessonId, v.estimatedReadingMinutes);
      }

      for (const lesson of lessons) {
        meta.set(lesson.id, {
          title: lesson.title,
          lessonKind: prismaLessonKindToDomain(lesson.kind),
          state: hasAnyVariant.has(lesson.id)
            ? hasPublishedVariant.has(lesson.id)
              ? 'published'
              : 'draft'
            : 'draft',
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
        meta.set(r.id, { title: r.title, lessonKind: null, state: null, durationMinutes: null }),
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
          state: null,
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
          state: null,
          durationMinutes:
            r.estimatedDurationSeconds != null ? Math.ceil(r.estimatedDurationSeconds / 60) : null,
        }),
      );
    }

    return meta;
  }
}
