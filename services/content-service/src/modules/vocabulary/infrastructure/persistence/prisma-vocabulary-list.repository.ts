import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IVocabularyListRepository,
  VocabularyListFilter,
  VOCABULARY_LIST_REPOSITORY,
} from '../../domain/repositories/vocabulary-list.repository.interface.js';
import { VocabularyListEntity } from '../../domain/entities/vocabulary-list.entity.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { VocabularyListMapper } from './mappers/vocabulary-list.mapper.js';
import { domainDifficultyToPrisma, domainVisibilityToPrisma } from './mappers/enum-converters.js';

export { VOCABULARY_LIST_REPOSITORY };

@Injectable()
export class PrismaVocabularyListRepository implements IVocabularyListRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<VocabularyListEntity | null> {
    const raw = await this.prisma.vocabularyList.findUnique({ where: { id } });
    return raw ? VocabularyListMapper.toDomain(raw) : null;
  }

  async findBySlug(slug: string): Promise<VocabularyListEntity | null> {
    const raw = await this.prisma.vocabularyList.findFirst({
      where: { slug, deletedAt: null },
    });
    return raw ? VocabularyListMapper.toDomain(raw) : null;
  }

  async findAll(filter: VocabularyListFilter): Promise<PaginatedResult<VocabularyListEntity>> {
    const where = this.buildWhere(filter);
    const orderBy = this.parseOrderBy(filter.sort);
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.vocabularyList.findMany({ where, orderBy, skip, take: filter.limit }),
      this.prisma.vocabularyList.count({ where }),
    ]);

    return {
      items: rows.map((row) => VocabularyListMapper.toDomain(row)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async save(entity: VocabularyListEntity): Promise<VocabularyListEntity> {
    const exists = await this.prisma.vocabularyList.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.vocabularyList.update({
          where: { id: entity.id },
          data: VocabularyListMapper.toUpdateData(entity),
        })
      : await this.prisma.vocabularyList.create({
          data: VocabularyListMapper.toCreateData(entity),
        });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return VocabularyListMapper.toDomain(raw);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.vocabularyList.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const count = await this.prisma.vocabularyList.count({
      where: { slug, deletedAt: null },
    });
    return count > 0;
  }

  /**
   * Cross-module read within content_db: queries container_items + container_versions.
   * Returns true if this vocabulary list is referenced by any container_item whose
   * parent container_version has status IN ('published', 'deprecated').
   */
  async hasPublishedContainerReferences(listId: string): Promise<boolean> {
    const hit = await this.prisma.containerItem.findFirst({
      where: {
        itemType: 'VOCABULARY_LIST',
        itemId: listId,
        containerVersion: {
          status: { in: ['PUBLISHED', 'DEPRECATED'] },
        },
      },
      select: { id: true },
    });
    return hit !== null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildWhere(filter: VocabularyListFilter): Prisma.VocabularyListWhereInput {
    const where: Prisma.VocabularyListWhereInput = {};

    if (!filter.includeDeleted) {
      where.deletedAt = null;
    }
    if (filter.targetLanguage) {
      where.targetLanguage = filter.targetLanguage;
    }
    if (filter.difficultyLevel) {
      where.difficultyLevel = domainDifficultyToPrisma(filter.difficultyLevel);
    }
    if (filter.visibility) {
      where.visibility = domainVisibilityToPrisma(filter.visibility);
    }
    if (filter.ownerUserId) {
      where.ownerUserId = filter.ownerUserId;
    }
    if (filter.ownerSchoolId) {
      where.ownerSchoolId = filter.ownerSchoolId;
    }
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private parseOrderBy(sort?: string): Prisma.VocabularyListOrderByWithRelationInput {
    switch (sort) {
      case 'title_asc':
        return { title: 'asc' };
      case 'title_desc':
        return { title: 'desc' };
      case 'created_at_asc':
        return { createdAt: 'asc' };
      case 'updated_at_desc':
        return { updatedAt: 'desc' };
      case 'created_at_desc':
      default:
        return { createdAt: 'desc' };
    }
  }
}
