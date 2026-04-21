import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  ILessonRepository,
  LessonFilter,
  LESSON_REPOSITORY,
} from '../../domain/repositories/lesson.repository.interface.js';
import { LessonEntity } from '../../domain/entities/lesson.entity.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { LessonMapper } from './mappers/lesson.mapper.js';
import { domainDifficultyToPrisma, domainVisibilityToPrisma } from './mappers/enum-converters.js';

// Suppress unused-symbol lint — symbol is declared here for module export.
export { LESSON_REPOSITORY };

@Injectable()
export class PrismaLessonRepository implements ILessonRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<LessonEntity | null> {
    const raw = await this.prisma.lesson.findUnique({ where: { id } });
    return raw ? LessonMapper.toDomain(raw) : null;
  }

  async findBySlug(slug: string): Promise<LessonEntity | null> {
    const raw = await this.prisma.lesson.findFirst({
      where: { slug, deletedAt: null },
    });
    return raw ? LessonMapper.toDomain(raw) : null;
  }

  async findAll(filter: LessonFilter): Promise<PaginatedResult<LessonEntity>> {
    const where = this.buildWhere(filter);
    const orderBy = this.parseOrderBy(filter.sort);
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.lesson.findMany({ where, orderBy, skip, take: filter.limit }),
      this.prisma.lesson.count({ where }),
    ]);

    return {
      items: rows.map((row) => LessonMapper.toDomain(row)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async save(entity: LessonEntity): Promise<LessonEntity> {
    const exists = await this.prisma.lesson.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.lesson.update({
          where: { id: entity.id },
          data: LessonMapper.toUpdateData(entity),
        })
      : await this.prisma.lesson.create({
          data: LessonMapper.toCreateData(entity),
        });

    // Publish domain events accumulated on the aggregate root.
    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return LessonMapper.toDomain(raw);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.lesson.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const count = await this.prisma.lesson.count({
      where: { slug, deletedAt: null },
    });
    return count > 0;
  }

  /**
   * Cross-module read: queries container_items + container_versions within the
   * same content_db database. Acceptable because Content Service owns a single
   * database and there is no network boundary between modules.
   *
   * Returns true if the lesson is referenced by any container_item whose parent
   * container_version has status IN ('published', 'deprecated').
   */
  async hasPublishedContainerReferences(lessonId: string): Promise<boolean> {
    const hit = await this.prisma.containerItem.findFirst({
      where: {
        itemType: 'LESSON',
        itemId: lessonId,
        containerVersion: {
          status: { in: ['PUBLISHED', 'DEPRECATED'] },
        },
      },
      select: { id: true },
    });
    return hit !== null;
  }

  /**
   * Returns true if the lesson has at least one variant with status = PUBLISHED.
   * Used by PublishVariantHandler to decide whether slug generation is needed.
   */
  async hasAnyPublishedVariant(lessonId: string): Promise<boolean> {
    const count = await this.prisma.lessonContentVariant.count({
      where: { lessonId, status: 'PUBLISHED', deletedAt: null },
    });
    return count > 0;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildWhere(filter: LessonFilter): Prisma.LessonWhereInput {
    const where: Prisma.LessonWhereInput = {};

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

  private parseOrderBy(sort?: string): Prisma.LessonOrderByWithRelationInput {
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
