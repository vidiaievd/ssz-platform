import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import type {
  IContentEntitlementRepository,
  EntitlementFilter,
} from '../../domain/repositories/content-entitlement.repository.interface.js';
import { ContentEntitlementEntity } from '../../domain/entities/content-entitlement.entity.js';
import type { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { ContentEntitlementMapper } from './mappers/content-entitlement.mapper.js';

@Injectable()
export class PrismaContentEntitlementRepository implements IContentEntitlementRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<ContentEntitlementEntity | null> {
    const raw = await this.prisma.contentEntitlement.findUnique({ where: { id } });
    return raw ? ContentEntitlementMapper.toDomain(raw) : null;
  }

  async findActiveByUser(
    userId: string,
    filter: EntitlementFilter,
  ): Promise<PaginatedResult<ContentEntitlementEntity>> {
    const now = new Date();
    const where = {
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.contentEntitlement.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: { grantedAt: 'desc' },
      }),
      this.prisma.contentEntitlement.count({ where }),
    ]);

    return {
      items: rows.map((r) => ContentEntitlementMapper.toDomain(r)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async findActiveByContainer(
    containerId: string,
    filter: EntitlementFilter,
  ): Promise<PaginatedResult<ContentEntitlementEntity>> {
    const now = new Date();
    const where = {
      containerId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.contentEntitlement.findMany({
        where,
        skip,
        take: filter.limit,
        orderBy: { grantedAt: 'desc' },
      }),
      this.prisma.contentEntitlement.count({ where }),
    ]);

    return {
      items: rows.map((r) => ContentEntitlementMapper.toDomain(r)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  hasActiveEntitlement(userId: string, containerId: string): Promise<boolean> {
    const now = new Date();
    return this.prisma.contentEntitlement
      .count({
        where: {
          userId,
          containerId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      })
      .then((count) => count > 0);
  }

  async save(entity: ContentEntitlementEntity): Promise<ContentEntitlementEntity> {
    const exists = await this.prisma.contentEntitlement.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.contentEntitlement.update({
          where: { id: entity.id },
          data: ContentEntitlementMapper.toUpdateData(entity),
        })
      : await this.prisma.contentEntitlement.create({
          data: ContentEntitlementMapper.toCreateData(entity),
        });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return ContentEntitlementMapper.toDomain(raw);
  }
}
