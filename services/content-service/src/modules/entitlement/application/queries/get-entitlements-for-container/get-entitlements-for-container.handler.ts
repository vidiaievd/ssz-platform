import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetEntitlementsForContainerQuery } from './get-entitlements-for-container.query.js';
import { CONTENT_ENTITLEMENT_REPOSITORY } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { IContentEntitlementRepository } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { ContentEntitlementEntity } from '../../../domain/entities/content-entitlement.entity.js';
import type { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

@QueryHandler(GetEntitlementsForContainerQuery)
export class GetEntitlementsForContainerHandler implements IQueryHandler<
  GetEntitlementsForContainerQuery,
  PaginatedResult<ContentEntitlementEntity>
> {
  constructor(
    @Inject(CONTENT_ENTITLEMENT_REPOSITORY)
    private readonly entitlementRepo: IContentEntitlementRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(
    query: GetEntitlementsForContainerQuery,
  ): Promise<PaginatedResult<ContentEntitlementEntity>> {
    const entity = await this.registry.resolve(TaggableEntityType.CONTAINER, query.containerId);
    if (!entity) throw new NotFoundException('Container not found');

    const decision = await this.checker.canAccess(
      { userId: query.callerUserId, isPlatformAdmin: query.isPlatformAdmin, roles: [] },
      entity,
      'edit',
    );
    if (!decision.allowed) throw new ForbiddenException('Insufficient access');

    return this.entitlementRepo.findActiveByContainer(query.containerId, {
      page: query.page,
      limit: query.limit,
    });
  }
}
