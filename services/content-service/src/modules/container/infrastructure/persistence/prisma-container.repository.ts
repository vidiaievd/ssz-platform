import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IContainerRepository } from '../../domain/repositories/container.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { ContainerEntity } from '../../domain/entities/container.entity.js';
import { ContainerFilter, PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { ContainerMapper } from './mappers/container.mapper.js';
import {
  domainContainerTypeToPrisma,
  domainDifficultyToPrisma,
  domainVisibilityToPrisma,
} from './mappers/enum-converters.js';

@Injectable()
export class PrismaContainerRepository implements IContainerRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<ContainerEntity | null> {
    const raw = await this.prisma.container.findUnique({ where: { id } });
    return raw ? ContainerMapper.toDomain(raw) : null;
  }

  async findBySlug(slug: string): Promise<ContainerEntity | null> {
    const raw = await this.prisma.container.findFirst({
      where: { slug, deletedAt: null },
    });
    return raw ? ContainerMapper.toDomain(raw) : null;
  }

  async findAll(filter: ContainerFilter): Promise<PaginatedResult<ContainerEntity>> {
    const where = this.buildWhere(filter);
    const orderBy = this.parseOrderBy(filter.sort);
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.container.findMany({ where, orderBy, skip, take: filter.limit }),
      this.prisma.container.count({ where }),
    ]);

    return {
      items: rows.map((row) => ContainerMapper.toDomain(row)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async save(entity: ContainerEntity): Promise<ContainerEntity> {
    const exists = await this.prisma.container.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.container.update({
          where: { id: entity.id },
          data: ContainerMapper.toUpdateData(entity),
        })
      : await this.prisma.container.create({
          data: ContainerMapper.toCreateData(entity),
        });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return ContainerMapper.toDomain(raw);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.container.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildWhere(filter: ContainerFilter): Prisma.ContainerWhereInput {
    const where: Prisma.ContainerWhereInput = {};

    if (!filter.includeDeleted) {
      where.deletedAt = null;
    }
    if (filter.targetLanguage) {
      where.targetLanguage = filter.targetLanguage;
    }
    if (filter.difficultyLevel) {
      where.difficultyLevel = domainDifficultyToPrisma(filter.difficultyLevel);
    }
    if (filter.containerType) {
      where.containerType = domainContainerTypeToPrisma(filter.containerType);
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

  private parseOrderBy(sort?: string): Prisma.ContainerOrderByWithRelationInput {
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
