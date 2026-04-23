import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMyEntitlementsQuery } from './list-my-entitlements.query.js';
import { CONTENT_ENTITLEMENT_REPOSITORY } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { IContentEntitlementRepository } from '../../../domain/repositories/content-entitlement.repository.interface.js';
import type { ContentEntitlementEntity } from '../../../domain/entities/content-entitlement.entity.js';
import type { PaginatedResult } from '../../../../../shared/kernel/pagination.js';

@QueryHandler(ListMyEntitlementsQuery)
export class ListMyEntitlementsHandler implements IQueryHandler<
  ListMyEntitlementsQuery,
  PaginatedResult<ContentEntitlementEntity>
> {
  constructor(
    @Inject(CONTENT_ENTITLEMENT_REPOSITORY)
    private readonly entitlementRepo: IContentEntitlementRepository,
  ) {}

  execute(query: ListMyEntitlementsQuery): Promise<PaginatedResult<ContentEntitlementEntity>> {
    return this.entitlementRepo.findActiveByUser(query.userId, {
      page: query.page,
      limit: query.limit,
    });
  }
}
