import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { CatalogQueryBuilderService } from '../../../../../shared/discovery/application/services/catalog-query-builder.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';
import { GetContainersQuery } from './get-containers.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerMapper } from '../../../infrastructure/persistence/mappers/container.mapper.js';
import {
  domainContainerTypeToPrisma,
  domainAccessTierToPrisma,
} from '../../../infrastructure/persistence/mappers/enum-converters.js';

const ALLOWED_SORT_FIELDS = ['created_at', 'updated_at', 'title'];
const DEFAULT_SORT = [{ field: 'createdAt', direction: 'desc' as const }];

@QueryHandler(GetContainersQuery)
export class GetContainersHandler implements IQueryHandler<
  GetContainersQuery,
  PaginatedResult<ContainerEntity>
> {
  private readonly logger = new Logger(GetContainersHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
    private readonly catalogBuilder: CatalogQueryBuilderService,
  ) {}

  async execute(query: GetContainersQuery): Promise<PaginatedResult<ContainerEntity>> {
    const { dto, user } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.ContainerOrderByWithRelationInput>(sortParams);
    const { skip, take } = this.pagination.toSkipTake(params);

    // TODO (Block 7): replace with batch school-membership lookup via OrganizationClient.
    // For now, school memberships are not pre-fetched — SCHOOL_PRIVATE content owned by
    // schools the user is a member of will not appear in catalog results for non-owners.
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
      tableContext: { entityType: TaggableEntityType.CONTAINER },
    });

    // Merge module-specific filters into the AND clause produced by the shared builder.
    const and = (baseWhere.AND as Record<string, unknown>[]).slice();
    if (dto.containerType) {
      and.push({ containerType: domainContainerTypeToPrisma(dto.containerType) });
    }
    if (dto.accessTier) {
      and.push({ accessTier: domainAccessTierToPrisma(dto.accessTier) });
    }

    const where = { ...baseWhere, AND: and } as Prisma.ContainerWhereInput;

    const [rows, total] = await Promise.all([
      this.prisma.container.findMany({ where, orderBy, skip, take }),
      this.prisma.container.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => ContainerMapper.toDomain(row)),
      total,
      params,
    );
  }
}
