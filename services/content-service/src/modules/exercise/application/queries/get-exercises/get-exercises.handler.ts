import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { CatalogQueryBuilderService } from '../../../../../shared/discovery/application/services/catalog-query-builder.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { GetExercisesQuery } from './get-exercises.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseMapper } from '../../../infrastructure/persistence/mappers/exercise.mapper.js';

// Exercise has no title column — search is not applied.
const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'desc' as const }];

@QueryHandler(GetExercisesQuery)
export class GetExercisesHandler implements IQueryHandler<
  GetExercisesQuery,
  PaginatedResult<ExerciseEntity>
> {
  private readonly logger = new Logger(GetExercisesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
    private readonly catalogBuilder: CatalogQueryBuilderService,
  ) {}

  async execute(query: GetExercisesQuery): Promise<PaginatedResult<ExerciseEntity>> {
    const { dto, user } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.ExerciseOrderByWithRelationInput>(sortParams);
    const { skip, take } = this.pagination.toSkipTake(params);

    // TODO (Block 7): replace with batch school-membership lookup via OrganizationClient.
    const schoolMemberships: string[] = [];

    const { where: baseWhere } = await this.catalogBuilder.build({
      filters: {
        targetLanguage: dto.targetLanguage,
        difficultyLevel: dto.difficultyLevel,
        tagIds: dto.tagIds,
        // search intentionally omitted — Exercise has no title column
        ownerSchoolId: dto.ownerSchoolId,
        ownerUserId: dto.ownerUserId,
        visibility: dto.visibility,
      },
      user,
      schoolMemberships,
      tableContext: { entityType: TaggableEntityType.EXERCISE },
    });

    const and = (baseWhere.AND as Record<string, unknown>[]).slice();
    if (dto.exerciseTemplateId) {
      and.push({ exerciseTemplateId: dto.exerciseTemplateId });
    }
    if (dto.estimatedDurationMin !== undefined) {
      and.push({ estimatedDurationSeconds: { gte: dto.estimatedDurationMin } });
    }
    if (dto.estimatedDurationMax !== undefined) {
      and.push({ estimatedDurationSeconds: { lte: dto.estimatedDurationMax } });
    }

    const where = { ...baseWhere, AND: and } as Prisma.ExerciseWhereInput;

    const [rows, total] = await Promise.all([
      this.prisma.exercise.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { template: { select: { code: true } } },
      }),
      this.prisma.exercise.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => ExerciseMapper.toDomain(row)),
      total,
      params,
    );
  }
}
