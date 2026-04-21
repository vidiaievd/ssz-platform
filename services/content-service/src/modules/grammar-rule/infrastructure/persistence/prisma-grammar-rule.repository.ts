import { Injectable, Inject } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IGrammarRuleRepository,
  GrammarRuleFilter,
  GRAMMAR_RULE_REPOSITORY,
} from '../../domain/repositories/grammar-rule.repository.interface.js';
import { GrammarRuleEntity } from '../../domain/entities/grammar-rule.entity.js';
import { PaginatedResult } from '../../../../shared/kernel/pagination.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { GrammarRuleMapper } from './mappers/grammar-rule.mapper.js';
import {
  domainDifficultyToPrisma,
  domainVisibilityToPrisma,
  domainGrammarTopicToPrisma,
} from './mappers/enum-converters.js';

export { GRAMMAR_RULE_REPOSITORY };

@Injectable()
export class PrismaGrammarRuleRepository implements IGrammarRuleRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async findById(id: string): Promise<GrammarRuleEntity | null> {
    const raw = await this.prisma.grammarRule.findUnique({ where: { id } });
    return raw ? GrammarRuleMapper.toDomain(raw) : null;
  }

  async findAll(filter: GrammarRuleFilter): Promise<PaginatedResult<GrammarRuleEntity>> {
    const where = this.buildWhere(filter);
    const orderBy = this.parseOrderBy(filter.sort);
    const skip = (filter.page - 1) * filter.limit;

    const [rows, total] = await Promise.all([
      this.prisma.grammarRule.findMany({ where, orderBy, skip, take: filter.limit }),
      this.prisma.grammarRule.count({ where }),
    ]);

    return {
      items: rows.map((row) => GrammarRuleMapper.toDomain(row)),
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async save(entity: GrammarRuleEntity): Promise<GrammarRuleEntity> {
    const exists = await this.prisma.grammarRule.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.grammarRule.update({
          where: { id: entity.id },
          data: GrammarRuleMapper.toUpdateData(entity),
        })
      : await this.prisma.grammarRule.create({
          data: GrammarRuleMapper.toCreateData(entity),
        });

    for (const event of entity.getDomainEvents()) {
      await this.eventPublisher.publish(event.eventType, event);
    }
    entity.clearDomainEvents();

    return GrammarRuleMapper.toDomain(raw);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.grammarRule.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const count = await this.prisma.grammarRule.count({
      where: { slug, deletedAt: null },
    });
    return count > 0;
  }

  async hasPublishedContainerReferences(ruleId: string): Promise<boolean> {
    const hit = await this.prisma.containerItem.findFirst({
      where: {
        itemType: 'GRAMMAR_RULE',
        itemId: ruleId,
        containerVersion: {
          status: { in: ['PUBLISHED', 'DEPRECATED'] },
        },
      },
      select: { id: true },
    });
    return hit !== null;
  }

  async hasAnyPublishedExplanation(ruleId: string): Promise<boolean> {
    const count = await this.prisma.grammarRuleExplanation.count({
      where: { grammarRuleId: ruleId, status: 'PUBLISHED', deletedAt: null },
    });
    return count > 0;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildWhere(filter: GrammarRuleFilter): Prisma.GrammarRuleWhereInput {
    const where: Prisma.GrammarRuleWhereInput = {};

    if (!filter.includeDeleted) {
      where.deletedAt = null;
    }
    if (filter.targetLanguage) {
      where.targetLanguage = filter.targetLanguage;
    }
    if (filter.difficultyLevel) {
      where.difficultyLevel = domainDifficultyToPrisma(filter.difficultyLevel);
    }
    if (filter.topic) {
      where.topic = domainGrammarTopicToPrisma(filter.topic);
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

  private parseOrderBy(sort?: string): Prisma.GrammarRuleOrderByWithRelationInput {
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
