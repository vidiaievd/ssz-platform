import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { GetPoolEntriesQuery } from './get-pool-entries.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import type { PoolEntryWithExercise } from '../../../domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import { GrammarRuleExercisePoolEntryMapper } from '../../../infrastructure/persistence/mappers/grammar-rule-exercise-pool-entry.mapper.js';
import { ExerciseMapper } from '../../../../exercise/infrastructure/persistence/mappers/exercise.mapper.js';
import type { ExerciseWithTemplate } from '../../../../exercise/infrastructure/persistence/mappers/exercise.mapper.js';

const ALLOWED_SORT_FIELDS = ['position', 'weight', 'added_at'];
const DEFAULT_SORT = [{ field: 'position', direction: 'asc' as const }];

@QueryHandler(GetPoolEntriesQuery)
export class GetPoolEntriesHandler implements IQueryHandler<
  GetPoolEntriesQuery,
  PaginatedResult<PoolEntryWithExercise>
> {
  private readonly logger = new Logger(GetPoolEntriesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
  ) {}

  async execute(query: GetPoolEntriesQuery): Promise<PaginatedResult<PoolEntryWithExercise>> {
    const { ruleId, dto } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.GrammarRuleExercisePoolOrderByWithRelationInput>(
        sortParams,
      );
    const { skip, take } = this.pagination.toSkipTake(params);

    const where: Prisma.GrammarRuleExercisePoolWhereInput = {
      grammarRuleId: ruleId,
      exercise: { deletedAt: null },
    };

    const [rows, total] = await Promise.all([
      this.prisma.grammarRuleExercisePool.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { exercise: { include: { template: { select: { code: true } } } } },
      }),
      this.prisma.grammarRuleExercisePool.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => ({
        entry: GrammarRuleExercisePoolEntryMapper.toDomain(row),
        exercise: ExerciseMapper.toDomain(row.exercise as unknown as ExerciseWithTemplate),
      })),
      total,
      params,
    );
  }
}
