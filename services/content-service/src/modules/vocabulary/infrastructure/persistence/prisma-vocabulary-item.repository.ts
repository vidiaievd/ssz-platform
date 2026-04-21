import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IVocabularyItemRepository,
  VOCABULARY_ITEM_REPOSITORY,
} from '../../domain/repositories/vocabulary-item.repository.interface.js';
import { VocabularyItemEntity } from '../../domain/entities/vocabulary-item.entity.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { VocabularyItemMapper } from './mappers/vocabulary-item.mapper.js';
import { VocabularyItemTranslationMapper } from './mappers/vocabulary-item-translation.mapper.js';
import { VocabularyUsageExampleMapper } from './mappers/vocabulary-usage-example.mapper.js';
import { VocabularyExampleTranslationMapper } from './mappers/vocabulary-example-translation.mapper.js';

export { VOCABULARY_ITEM_REPOSITORY };

@Injectable()
export class PrismaVocabularyItemRepository implements IVocabularyItemRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string, includeChildren = false): Promise<VocabularyItemEntity | null> {
    if (!includeChildren) {
      const raw = await this.prisma.vocabularyItem.findUnique({ where: { id } });
      return raw ? VocabularyItemMapper.toDomain(raw) : null;
    }

    const raw = await this.prisma.vocabularyItem.findUnique({
      where: { id },
      include: {
        translations: true,
        usageExamples: {
          orderBy: { position: 'asc' },
          include: { translations: true },
        },
      },
    });

    if (!raw) return null;

    const translationEntities = raw.translations.map((t) =>
      VocabularyItemTranslationMapper.toDomain(t),
    );
    const exampleEntities = raw.usageExamples.map((ex) => {
      const exTranslations = ex.translations.map((t) =>
        VocabularyExampleTranslationMapper.toDomain(t),
      );
      return VocabularyUsageExampleMapper.toDomain(ex, exTranslations);
    });

    return VocabularyItemMapper.toDomain(raw, translationEntities, exampleEntities);
  }

  async findByListId(
    listId: string,
    options: { page?: number; limit?: number; includeDeleted?: boolean } = {},
  ): Promise<PaginatedResult<VocabularyItemEntity>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const skip = (page - 1) * limit;

    const where = {
      vocabularyListId: listId,
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    };

    const [rows, total] = await Promise.all([
      this.prisma.vocabularyItem.findMany({
        where,
        orderBy: { position: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.vocabularyItem.count({ where }),
    ]);

    return {
      items: rows.map((row) => VocabularyItemMapper.toDomain(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByIds(ids: string[], includeChildren = false): Promise<VocabularyItemEntity[]> {
    if (ids.length === 0) return [];

    if (!includeChildren) {
      const rows = await this.prisma.vocabularyItem.findMany({
        where: { id: { in: ids }, deletedAt: null },
      });
      return rows.map((row) => VocabularyItemMapper.toDomain(row));
    }

    const rows = await this.prisma.vocabularyItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: {
        translations: true,
        usageExamples: {
          orderBy: { position: 'asc' },
          include: { translations: true },
        },
      },
    });

    return rows.map((raw) => {
      const translationEntities = raw.translations.map((t) =>
        VocabularyItemTranslationMapper.toDomain(t),
      );
      const exampleEntities = raw.usageExamples.map((ex) => {
        const exTranslations = ex.translations.map((t) =>
          VocabularyExampleTranslationMapper.toDomain(t),
        );
        return VocabularyUsageExampleMapper.toDomain(ex, exTranslations);
      });
      return VocabularyItemMapper.toDomain(raw, translationEntities, exampleEntities);
    });
  }

  async save(entity: VocabularyItemEntity): Promise<VocabularyItemEntity> {
    const exists = await this.prisma.vocabularyItem.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.vocabularyItem.update({
          where: { id: entity.id },
          data: VocabularyItemMapper.toUpdateData(entity),
        })
      : await this.prisma.vocabularyItem.create({
          data: VocabularyItemMapper.toCreateData(entity),
        });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return VocabularyItemMapper.toDomain(raw);
  }

  async saveBatch(entities: VocabularyItemEntity[]): Promise<VocabularyItemEntity[]> {
    if (entities.length === 0) return [];

    // Use a transaction: createMany does not return created rows in Postgres when
    // using skipDuplicates, and we need the IDs. Fall back to individual creates.
    const created = await this.prisma.$transaction(
      entities.map((entity) =>
        this.prisma.vocabularyItem.create({
          data: VocabularyItemMapper.toCreateData(entity),
        }),
      ),
    );

    // Publish events for all entities after the full batch is persisted.
    for (const entity of entities) {
      for (const event of entity.getDomainEvents()) {
        await this.eventPublisher.publish(event.eventType, event);
      }
      entity.clearDomainEvents();
    }

    return created.map((raw) => VocabularyItemMapper.toDomain(raw));
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.vocabularyItem.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async getMaxPosition(listId: string): Promise<number> {
    const result = await this.prisma.vocabularyItem.aggregate({
      where: { vocabularyListId: listId, deletedAt: null },
      _max: { position: true },
    });
    return result._max.position ?? -1;
  }

  /**
   * Reorders all items atomically within a transaction.
   *
   * A naïve approach would violate the UNIQUE(vocabularyListId, position) constraint
   * when two items swap positions (e.g. item A at 0→1 and item B at 1→0 collide
   * mid-transaction). The fix is a two-pass approach:
   *   Pass 1 — shift all positions to a temporary range (current + 10000)
   *   Pass 2 — set final target positions
   * This ensures no constraint violation occurs between writes.
   */
  async reorder(listId: string, items: { id: string; position: number }[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Pass 1: shift to temporary positions to avoid unique constraint collisions
      for (const item of items) {
        await tx.vocabularyItem.update({
          where: { id: item.id },
          data: { position: item.position + 10000 },
        });
      }
      // Pass 2: set final target positions
      for (const item of items) {
        await tx.vocabularyItem.update({
          where: { id: item.id },
          data: { position: item.position },
        });
      }
    });
  }

  async softDeleteByListId(listId: string): Promise<void> {
    const now = new Date();
    await this.prisma.vocabularyItem.updateMany({
      where: { vocabularyListId: listId, deletedAt: null },
      data: { deletedAt: now, updatedAt: now },
    });
  }

  async wordExists(listId: string, word: string, excludeItemId?: string): Promise<boolean> {
    const count = await this.prisma.vocabularyItem.count({
      where: {
        vocabularyListId: listId,
        word,
        deletedAt: null,
        ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      },
    });
    return count > 0;
  }
}
