import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { GetLessonVariantsQuery } from './get-lesson-variants.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonContentVariantMapper } from '../../../infrastructure/persistence/mappers/lesson-content-variant.mapper.js';
import { domainVariantStatusToPrisma } from '../../../infrastructure/persistence/mappers/enum-converters.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'asc' as const }];

@QueryHandler(GetLessonVariantsQuery)
export class GetLessonVariantsHandler implements IQueryHandler<
  GetLessonVariantsQuery,
  PaginatedResult<LessonContentVariantEntity>
> {
  private readonly logger = new Logger(GetLessonVariantsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
  ) {}

  async execute(
    query: GetLessonVariantsQuery,
  ): Promise<PaginatedResult<LessonContentVariantEntity>> {
    const { lessonId, dto } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.LessonContentVariantOrderByWithRelationInput>(
        sortParams,
      );
    const { skip, take } = this.pagination.toSkipTake(params);

    const where: Prisma.LessonContentVariantWhereInput = {
      lessonId,
      deletedAt: null,
      ...(dto.status ? { status: domainVariantStatusToPrisma(dto.status) } : {}),
      ...(dto.explanationLanguage ? { explanationLanguage: dto.explanationLanguage } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.lessonContentVariant.findMany({ where, orderBy, skip, take }),
      this.prisma.lessonContentVariant.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => LessonContentVariantMapper.toDomain(row)),
      total,
      params,
    );
  }
}
