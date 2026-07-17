import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { GetGrammarRuleExplanationsQuery } from './get-grammar-rule-explanations.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { GrammarRuleExplanationMapper } from '../../../infrastructure/persistence/mappers/grammar-rule-explanation.mapper.js';
import { domainVariantStatusToPrisma } from '../../../infrastructure/persistence/mappers/enum-converters.js';
import { GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import type { IGrammarRuleCompareExampleRepository } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import { GRAMMAR_RULE_QUICK_CHECK_REPOSITORY } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import type { IGrammarRuleQuickCheckRepository } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import { Inject } from '@nestjs/common';
import type { GrammarRuleExplanationWithComposite } from '../get-grammar-rule-explanation/get-grammar-rule-explanation.handler.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'asc' as const }];

@QueryHandler(GetGrammarRuleExplanationsQuery)
export class GetGrammarRuleExplanationsHandler implements IQueryHandler<
  GetGrammarRuleExplanationsQuery,
  PaginatedResult<GrammarRuleExplanationWithComposite>
> {
  private readonly logger = new Logger(GetGrammarRuleExplanationsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
    @Inject(GRAMMAR_RULE_COMPARE_EXAMPLE_REPOSITORY)
    private readonly compareExampleRepo: IGrammarRuleCompareExampleRepository,
    @Inject(GRAMMAR_RULE_QUICK_CHECK_REPOSITORY)
    private readonly quickCheckRepo: IGrammarRuleQuickCheckRepository,
  ) {}

  async execute(
    query: GetGrammarRuleExplanationsQuery,
  ): Promise<PaginatedResult<GrammarRuleExplanationWithComposite>> {
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

    const explanations = rows.map((row) => GrammarRuleExplanationMapper.toDomain(row));
    const items = await Promise.all(
      explanations.map(async (explanation) => {
        const [compareExamples, quickCheck] = await Promise.all([
          this.compareExampleRepo.findByExplanationId(explanation.id),
          this.quickCheckRepo.findByExplanationId(explanation.id),
        ]);
        return { explanation, compareExamples, quickCheck };
      }),
    );

    return this.pagination.toPaginatedResult(items, total, params);
  }
}
