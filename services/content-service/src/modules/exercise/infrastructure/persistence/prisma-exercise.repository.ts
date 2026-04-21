import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IExerciseRepository,
  ExerciseFilter,
  EXERCISE_REPOSITORY,
} from '../../domain/repositories/exercise.repository.interface.js';
import { ExerciseEntity } from '../../domain/entities/exercise.entity.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { ExerciseMapper } from './mappers/exercise.mapper.js';
import { domainDifficultyToPrisma, domainVisibilityToPrisma } from './mappers/enum-converters.js';

export { EXERCISE_REPOSITORY };

const TEMPLATE_SELECT = { template: { select: { code: true } } } as const;

@Injectable()
export class PrismaExerciseRepository implements IExerciseRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string, includeInstructions = false): Promise<ExerciseEntity | null> {
    const raw = await this.prisma.exercise.findUnique({
      where: { id },
      include: {
        ...TEMPLATE_SELECT,
        ...(includeInstructions ? { instructions: true } : {}),
      },
    });
    return raw ? ExerciseMapper.toDomain(raw) : null;
  }

  async findAll(filter: ExerciseFilter): Promise<PaginatedResult<ExerciseEntity>> {
    const where = this.buildWhere(filter);
    const orderBy = this.parseOrderBy(filter.sort);
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy,
        skip,
        take: filter.limit,
        include: TEMPLATE_SELECT,
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return {
      items: rows.map((row) => ExerciseMapper.toDomain(row)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async save(entity: ExerciseEntity): Promise<ExerciseEntity> {
    const exists = await this.prisma.exercise.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.exercise.update({
          where: { id: entity.id },
          data: ExerciseMapper.toUpdateData(entity),
          include: TEMPLATE_SELECT,
        })
      : await this.prisma.exercise.create({
          data: ExerciseMapper.toCreateData(entity),
          include: TEMPLATE_SELECT,
        });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return ExerciseMapper.toDomain(raw);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.exercise.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async hasPublishedContainerReferences(exerciseId: string): Promise<boolean> {
    const hit = await this.prisma.containerItem.findFirst({
      where: {
        itemType: 'EXERCISE',
        itemId: exerciseId,
        containerVersion: {
          status: { in: ['PUBLISHED', 'DEPRECATED'] },
        },
      },
      select: { id: true },
    });
    return hit !== null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildWhere(filter: ExerciseFilter): Prisma.ExerciseWhereInput {
    const where: Prisma.ExerciseWhereInput = {};

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
    if (filter.exerciseTemplateId) {
      where.exerciseTemplateId = filter.exerciseTemplateId;
    }
    if (filter.ownerUserId) {
      where.ownerUserId = filter.ownerUserId;
    }
    if (filter.ownerSchoolId) {
      where.ownerSchoolId = filter.ownerSchoolId;
    }

    return where;
  }

  private parseOrderBy(sort?: string): Prisma.ExerciseOrderByWithRelationInput {
    switch (sort) {
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
