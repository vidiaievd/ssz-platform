import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { GetContainersQuery } from './get-containers.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import {
  CONTAINER_CATALOG_READER,
  type IContainerCatalogReader,
} from '../../../domain/repositories/container-catalog.reader.interface.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at', 'title'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'desc' as const }];

@QueryHandler(GetContainersQuery)
export class GetContainersHandler implements IQueryHandler<
  GetContainersQuery,
  PaginatedResult<ContainerEntity>
> {
  constructor(
    @Inject(CONTAINER_CATALOG_READER) private readonly catalog: IContainerCatalogReader,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
  ) {}

  async execute(query: GetContainersQuery): Promise<PaginatedResult<ContainerEntity>> {
    const { dto, user } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sort = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const { skip, take } = this.pagination.toSkipTake(params);

    const { items, total } = await this.catalog.findPage({
      userId: user.userId,
      filters: {
        targetLanguage: dto.targetLanguage,
        difficultyLevel: dto.difficultyLevel,
        tagIds: dto.tagIds,
        search: dto.search,
        ownerSchoolId: dto.ownerSchoolId,
        ownerUserId: dto.ownerUserId,
        visibility: dto.visibility,
      },
      containerType: dto.containerType,
      accessTier: dto.accessTier,
      includeHidden: dto.includeObsolete === true,
      sort,
      skip,
      take,
    });

    return this.pagination.toPaginatedResult(items, total, params);
  }
}
