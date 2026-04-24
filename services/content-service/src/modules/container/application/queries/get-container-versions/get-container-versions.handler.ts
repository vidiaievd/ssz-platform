import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import type { Prisma } from '../../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { PaginationService } from '../../../../../shared/discovery/application/services/pagination.service.js';
import { SortParserService } from '../../../../../shared/discovery/application/services/sort-parser.service.js';
import { GetContainerVersionsQuery } from './get-container-versions.query.js';
import type { PaginatedResult } from '../../../../../shared/discovery/domain/types/pagination.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { ContainerVersionMapper } from '../../../infrastructure/persistence/mappers/container-version.mapper.js';
import { domainVersionStatusToPrisma } from '../../../infrastructure/persistence/mappers/enum-converters.js';

const ALLOWED_SORT_FIELDS = ['version_number', 'created_at'];
const DEFAULT_SORT = [{ field: 'versionNumber', direction: 'desc' as const }];

@QueryHandler(GetContainerVersionsQuery)
export class GetContainerVersionsHandler implements IQueryHandler<
  GetContainerVersionsQuery,
  PaginatedResult<ContainerVersionEntity>
> {
  private readonly logger = new Logger(GetContainerVersionsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly sortParser: SortParserService,
  ) {}

  async execute(
    query: GetContainerVersionsQuery,
  ): Promise<PaginatedResult<ContainerVersionEntity>> {
    const { containerId, dto } = query;

    const params = this.pagination.normalize(dto.page, dto.limit);
    const sortParams = this.sortParser.parse(dto.sort, ALLOWED_SORT_FIELDS, DEFAULT_SORT);
    const orderBy =
      this.sortParser.toPrismaOrderBy<Prisma.ContainerVersionOrderByWithRelationInput>(sortParams);
    const { skip, take } = this.pagination.toSkipTake(params);

    const where: Prisma.ContainerVersionWhereInput = {
      containerId,
      ...(dto.status ? { status: domainVersionStatusToPrisma(dto.status) } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.containerVersion.findMany({ where, orderBy, skip, take }),
      this.prisma.containerVersion.count({ where }),
    ]);

    return this.pagination.toPaginatedResult(
      rows.map((row) => ContainerVersionMapper.toDomain(row)),
      total,
      params,
    );
  }
}
