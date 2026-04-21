import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import type {
  ITagRepository,
  TagFilter,
} from '../../domain/repositories/tag.repository.interface.js';
import { TagEntity } from '../../domain/entities/tag.entity.js';
import { TagScope } from '../../domain/value-objects/tag-scope.vo.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { TagMapper } from './mappers/tag.mapper.js';
import {
  domainTagScopeToPrisma,
  domainTagCategoryToPrisma,
} from './mappers/tag-enum-converters.js';

@Injectable()
export class PrismaTagRepository implements ITagRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<TagEntity | null> {
    const raw = await this.prisma.tag.findUnique({ where: { id } });
    return raw ? TagMapper.toDomain(raw) : null;
  }

  async findBySlugAndScope(
    slug: string,
    scope: TagScope,
    ownerSchoolId: string | null,
  ): Promise<TagEntity | null> {
    const raw = await this.prisma.tag.findFirst({
      where: {
        slug,
        scope: domainTagScopeToPrisma(scope),
        ownerSchoolId: ownerSchoolId ?? null,
        deletedAt: null,
      },
    });
    return raw ? TagMapper.toDomain(raw) : null;
  }

  countBySlugPrefix(
    slugBase: string,
    scope: TagScope,
    ownerSchoolId: string | null,
  ): Promise<number> {
    return this.prisma.tag.count({
      where: {
        slug: { startsWith: slugBase },
        scope: domainTagScopeToPrisma(scope),
        ownerSchoolId: ownerSchoolId ?? null,
        deletedAt: null,
      },
    });
  }

  async findAll(filter: TagFilter): Promise<PaginatedResult<TagEntity>> {
    const where = this.buildWhere(filter);
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.tag.findMany({ where, skip, take: filter.limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.tag.count({ where }),
    ]);

    return {
      items: rows.map((r) => TagMapper.toDomain(r)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async save(entity: TagEntity): Promise<TagEntity> {
    const exists = await this.prisma.tag.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.tag.update({
          where: { id: entity.id },
          data: TagMapper.toUpdateData(entity),
        })
      : await this.prisma.tag.create({ data: TagMapper.toCreateData(entity) });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return TagMapper.toDomain(raw);
  }

  private buildWhere(filter: TagFilter): Prisma.TagWhereInput {
    const where: Prisma.TagWhereInput = { deletedAt: null };
    if (filter.scope) where.scope = domainTagScopeToPrisma(filter.scope);
    if (filter.category) where.category = domainTagCategoryToPrisma(filter.category);
    if (filter.ownerSchoolId !== undefined) where.ownerSchoolId = filter.ownerSchoolId;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
