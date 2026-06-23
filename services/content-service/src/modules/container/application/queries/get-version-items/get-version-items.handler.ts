import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVersionItemsQuery } from './get-version-items.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';

export interface VersionItemsResult {
  items: ContainerItemEntity[];
  titles: Map<string, string | null>;
}

@QueryHandler(GetVersionItemsQuery)
export class GetVersionItemsHandler implements IQueryHandler<
  GetVersionItemsQuery,
  Result<VersionItemsResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    query: GetVersionItemsQuery,
  ): Promise<Result<VersionItemsResult, ContainerDomainError>> {
    const version = await this.versionRepo.findById(query.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const items = await this.itemRepo.findByVersionId(query.versionId);
    const titles = await this.resolveTitles(items);
    return Result.ok({ items, titles });
  }

  // Read-side denormalization: items reference reusable content (lessons,
  // vocabulary lists, grammar rules, exercises) by id only — the frontend
  // needs a display title without an extra round-trip per item.
  private async resolveTitles(items: ContainerItemEntity[]): Promise<Map<string, string | null>> {
    const titles = new Map<string, string | null>();
    const idsByType = new Map<ContainerItemType, string[]>();
    for (const item of items) {
      const ids = idsByType.get(item.itemType) ?? [];
      ids.push(item.itemId);
      idsByType.set(item.itemType, ids);
    }

    const lessonIds = idsByType.get(ContainerItemType.LESSON) ?? [];
    if (lessonIds.length > 0) {
      const rows = await this.prisma.lesson.findMany({
        where: { id: { in: lessonIds } },
        select: { id: true, title: true },
      });
      rows.forEach((r) => titles.set(r.id, r.title));
    }

    const vocabularyListIds = idsByType.get(ContainerItemType.VOCABULARY_LIST) ?? [];
    if (vocabularyListIds.length > 0) {
      const rows = await this.prisma.vocabularyList.findMany({
        where: { id: { in: vocabularyListIds } },
        select: { id: true, title: true },
      });
      rows.forEach((r) => titles.set(r.id, r.title));
    }

    const grammarRuleIds = idsByType.get(ContainerItemType.GRAMMAR_RULE) ?? [];
    if (grammarRuleIds.length > 0) {
      const rows = await this.prisma.grammarRule.findMany({
        where: { id: { in: grammarRuleIds } },
        select: { id: true, title: true },
      });
      rows.forEach((r) => titles.set(r.id, r.title));
    }

    const exerciseIds = idsByType.get(ContainerItemType.EXERCISE) ?? [];
    if (exerciseIds.length > 0) {
      const rows = await this.prisma.exercise.findMany({
        where: { id: { in: exerciseIds } },
        select: { id: true, template: { select: { name: true } } },
      });
      rows.forEach((r) => titles.set(r.id, r.template.name ?? null));
    }

    return titles;
  }
}
