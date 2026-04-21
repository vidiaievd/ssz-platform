import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import type {
  IContentShareRepository,
  ContentShareFilter,
} from '../../domain/repositories/content-share.repository.interface.js';
import { ContentShareEntity } from '../../domain/entities/content-share.entity.js';
import type { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { ContentShareMapper } from './mappers/content-share.mapper.js';
import { domainEntityTypeToPrisma } from '../../../tag/infrastructure/persistence/mappers/tag-enum-converters.js';

@Injectable()
export class PrismaContentShareRepository implements IContentShareRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<ContentShareEntity | null> {
    const raw = await this.prisma.contentShare.findUnique({ where: { id } });
    return raw ? ContentShareMapper.toDomain(raw) : null;
  }

  async findActiveByEntity(
    entityType: TaggableEntityType,
    entityId: string,
  ): Promise<ContentShareEntity[]> {
    const now = new Date();
    const rows = await this.prisma.contentShare.findMany({
      where: {
        entityType: domainEntityTypeToPrisma(entityType),
        entityId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ContentShareMapper.toDomain(r));
  }

  async findActiveBySharedWithUser(
    userId: string,
    filter: ContentShareFilter,
  ): Promise<PaginatedResult<ContentShareEntity>> {
    const now = new Date();
    const where = {
      sharedWithUserId: userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.contentShare.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contentShare.count({ where }),
    ]);

    return {
      items: rows.map((r) => ContentShareMapper.toDomain(r)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async findExpiredAndNotRevoked(now: Date): Promise<ContentShareEntity[]> {
    const rows = await this.prisma.contentShare.findMany({
      where: {
        revokedAt: null,
        expiresAt: { lte: now },
      },
    });
    return rows.map((r) => ContentShareMapper.toDomain(r));
  }

  async hasActiveShare(
    entityType: TaggableEntityType,
    entityId: string,
    userId: string,
  ): Promise<boolean> {
    const now = new Date();
    const count = await this.prisma.contentShare.count({
      where: {
        entityType: domainEntityTypeToPrisma(entityType),
        entityId,
        sharedWithUserId: userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return count > 0;
  }

  async save(entity: ContentShareEntity): Promise<ContentShareEntity> {
    const exists = await this.prisma.contentShare.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.contentShare.update({
          where: { id: entity.id },
          data: ContentShareMapper.toUpdateData(entity),
        })
      : await this.prisma.contentShare.create({ data: ContentShareMapper.toCreateData(entity) });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return ContentShareMapper.toDomain(raw);
  }

  async saveMany(entities: ContentShareEntity[]): Promise<void> {
    for (const entity of entities) {
      await this.save(entity);
    }
  }
}
