import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { GetGrammarRuleExplanationsQuery } from './get-grammar-rule-explanations.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GrammarRuleExplanationMapper } from '../../../infrastructure/persistence/mappers/grammar-rule-explanation.mapper.js';
import { domainVariantStatusToPrisma } from '../../../infrastructure/persistence/mappers/enum-converters.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'asc' as const }];

@QueryHandler(GetGrammarRuleExplanationsQuery)
export class GetGrammarRuleExplanationsHandler implements IQueryHandler<
  GetGrammarRuleExplanationsQuery,
  PaginatedResult<GrammarRuleExplanationEntity>
> {
  private readonly logger = new Logger(GetGrammarRuleExplanationsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
  ) {}

  async execute(
    query: GetGrammarRuleExplanationsQuery,
  ): Promise<PaginatedResult<GrammarRuleExplanationEntity>> {
    const { ruleId, dto } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.GrammarRuleExplanationOrderByWithRelationInput>(
        sortParams,
      );
    const { skip, take } = this.pagination.toSkipTake(params);

    const where: Prisma.GrammarRuleExplanationWhereInput = {
      grammarRuleId: ruleId,
      deletedAt: null,
      ...(dto.status ? { status: domainVariantStatusToPrisma(dto.status) } : {}),
      ...(dto.explanationLanguage ? { explanationLanguage: dto.explanationLanguage } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.grammarRuleExplanation.findMany({ where, orderBy, skip, take }),
      this.prisma.grammarRuleExplanation.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => GrammarRuleExplanationMapper.toDomain(row)),
      total,
      params,
    );
  }
}
