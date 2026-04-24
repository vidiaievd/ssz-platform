import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { CatalogQueryBuilderService } from '../../../../../shared/discovery/application/services/catalog-query-builder.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { GetGrammarRulesQuery } from './get-grammar-rules.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { GrammarRuleMapper } from '../../../infrastructure/persistence/mappers/grammar-rule.mapper.js';
import { domainGrammarTopicToPrisma } from '../../../infrastructure/persistence/mappers/enum-converters.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at', 'title'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'desc' as const }];

@QueryHandler(GetGrammarRulesQuery)
export class GetGrammarRulesHandler implements IQueryHandler<
  GetGrammarRulesQuery,
  PaginatedResult<GrammarRuleEntity>
> {
  private readonly logger = new Logger(GetGrammarRulesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
    private readonly catalogBuilder: CatalogQueryBuilderService,
  ) {}

  async execute(query: GetGrammarRulesQuery): Promise<PaginatedResult<GrammarRuleEntity>> {
    const { dto, user } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.GrammarRuleOrderByWithRelationInput>(sortParams);
    const { skip, take } = this.pagination.toSkipTake(params);

    // TODO (Block 7): replace with batch school-membership lookup via OrganizationClient.
    const schoolMemberships: string[] = [];

    const { where: baseWhere } = await this.catalogBuilder.build({
      filters: {
        targetLanguage: dto.targetLanguage,
        difficultyLevel: dto.difficultyLevel,
        tagIds: dto.tagIds,
        search: dto.search,
        ownerSchoolId: dto.ownerSchoolId,
        ownerUserId: dto.ownerUserId,
        visibility: dto.visibility,
      },
      user,
      schoolMemberships,
      tableContext: { entityType: TaggableEntityType.GRAMMAR_RULE },
    });

    const and = (baseWhere.AND as Record<string, unknown>[]).slice();
    if (dto.topic) {
      and.push({ topic: domainGrammarTopicToPrisma(dto.topic) });
    }

    const where = { ...baseWhere, AND: and } as Prisma.GrammarRuleWhereInput;

    const [rows, total] = await Promise.all([
      this.prisma.grammarRule.findMany({ where, orderBy, skip, take }),
      this.prisma.grammarRule.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => GrammarRuleMapper.toDomain(row)),
      total,
      params,
    );
  }
}
