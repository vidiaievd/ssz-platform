import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CatalogQueryBuilderService } from '../../../../shared/discovery/application/services/catalog-query-builder.service.js';
import { SortParserService } from '../../../../shared/discovery/application/services/sort-parser.service.js';
import { TaggableEntityType } from '../../../../shared/access-control/domain/types/taggable-entity-type.js';
import type {
  ContainerCatalogCriteria,
  IContainerCatalogReader,
} from '../../domain/repositories/container-catalog.reader.interface.js';
import { ContainerMapper } from './mappers/container.mapper.js';
import { domainContainerTypeToPrisma, domainAccessTierToPrisma } from './mappers/enum-converters.js';

@Injectable()
export class PrismaContainerCatalogReader implements IContainerCatalogReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sortParser: SortParserService,
    private readonly catalogBuilder: CatalogQueryBuilderService,
  ) {}

  async findPage(c: ContainerCatalogCriteria) {
    // TODO (Block 7): replace with batch school-membership lookup via OrganizationClient.
    // For now, school memberships are not pre-fetched — SCHOOL_PRIVATE content owned by
    // schools the user is a member of will not appear in catalog results for non-owners.
    const schoolMemberships: string[] = [];

    const { where: baseWhere } = await this.catalogBuilder.build({
      filters: c.filters,
      user: { userId: c.userId },
      schoolMemberships,
      tableContext: { entityType: TaggableEntityType.CONTAINER },
    });

    // Merge module-specific filters into the AND clause produced by the shared builder.
    const and = (baseWhere.AND as Record<string, unknown>[]).slice();
    if (c.containerType) {
      and.push({ containerType: domainContainerTypeToPrisma(c.containerType) });
    }
    if (c.accessTier) {
      and.push({ accessTier: domainAccessTierToPrisma(c.accessTier) });
    }
    // Obsolete (plan 90, Q5) and archived courses leave the catalogue and search. Their
    // author still lists them — it is the only way back.
    if (!c.includeHidden) {
      and.push({
        OR: [
          { maintenanceStatus: { not: 'OBSOLETE' }, archivedAt: null },
          { ownerUserId: c.userId },
        ],
      });
    }

    const where = { ...baseWhere, AND: and } as Prisma.ContainerWhereInput;
    const orderBy = this.sortParser.toPrismaOrderBy<Prisma.ContainerOrderByWithRelationInput>(c.sort);

    const [rows, total] = await Promise.all([
      this.prisma.container.findMany({ where, orderBy, skip: c.skip, take: c.take }),
      this.prisma.container.count({ where }),
    ]);

    return { items: rows.map((row) => ContainerMapper.toDomain(row)), total };
  }
}
