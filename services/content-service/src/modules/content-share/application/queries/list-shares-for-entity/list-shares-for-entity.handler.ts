import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListSharesForEntityQuery } from './list-shares-for-entity.query.js';
import { CONTENT_SHARE_REPOSITORY } from '../../../domain/repositories/content-share.repository.interface.js';
import type { IContentShareRepository } from '../../../domain/repositories/content-share.repository.interface.js';
import type { ContentShareEntity } from '../../../domain/entities/content-share.entity.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';

@QueryHandler(ListSharesForEntityQuery)
export class ListSharesForEntityHandler implements IQueryHandler<
  ListSharesForEntityQuery,
  ContentShareEntity[]
> {
  constructor(
    @Inject(CONTENT_SHARE_REPOSITORY) private readonly shareRepo: IContentShareRepository,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(query: ListSharesForEntityQuery): Promise<ContentShareEntity[]> {
    const entity = await this.registry.resolve(query.entityType, query.entityId);
    if (!entity) throw new NotFoundException('Entity not found');

    const decision = await this.checker.canAccess(
      { userId: query.callerUserId, isPlatformAdmin: query.isPlatformAdmin, roles: [] },
      entity,
      'edit',
    );
    if (!decision.allowed) throw new ForbiddenException('Insufficient access');

    return this.shareRepo.findActiveByEntity(query.entityType, query.entityId);
  }
}
