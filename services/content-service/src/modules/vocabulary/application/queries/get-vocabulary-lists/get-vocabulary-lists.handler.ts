import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { CatalogQueryBuilderService } from '../../../../../shared/discovery/application/services/catalog-query-builder.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { GetVocabularyListsQuery } from './get-vocabulary-lists.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';
import { VocabularyListMapper } from '../../../infrastructure/persistence/mappers/vocabulary-list.mapper.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at', 'title'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'desc' as const }];

@QueryHandler(GetVocabularyListsQuery)
export class GetVocabularyListsHandler implements IQueryHandler<
  GetVocabularyListsQuery,
  PaginatedResult<VocabularyListEntity>
> {
  private readonly logger = new Logger(GetVocabularyListsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
    private readonly catalogBuilder: CatalogQueryBuilderService,
  ) {}

  async execute(query: GetVocabularyListsQuery): Promise<PaginatedResult<VocabularyListEntity>> {
    const { dto, user } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.VocabularyListOrderByWithRelationInput>(sortParams);
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
      tableContext: { entityType: TaggableEntityType.VOCABULARY_LIST },
    });

    const where = baseWhere as Prisma.VocabularyListWhereInput;

    const [rows, total] = await Promise.all([
      this.prisma.vocabularyList.findMany({ where, orderBy, skip, take }),
      this.prisma.vocabularyList.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => VocabularyListMapper.toDomain(row)),
      total,
      params,
    );
  }
}
