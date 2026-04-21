import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMySharedWithMeQuery } from './list-my-shared-with-me.query.js';
import { CONTENT_SHARE_REPOSITORY } from '../../../domain/repositories/content-share.repository.interface.js';
import type { IContentShareRepository } from '../../../domain/repositories/content-share.repository.interface.js';
import type { ContentShareEntity } from '../../../domain/entities/content-share.entity.js';
import type { PaginatedResult } from '../../../../../shared/kernel/pagination.js';

@QueryHandler(ListMySharedWithMeQuery)
export class ListMySharedWithMeHandler implements IQueryHandler<
  ListMySharedWithMeQuery,
  PaginatedResult<ContentShareEntity>
> {
  constructor(
    @Inject(CONTENT_SHARE_REPOSITORY) private readonly shareRepo: IContentShareRepository,
  ) {}

  execute(query: ListMySharedWithMeQuery): Promise<PaginatedResult<ContentShareEntity>> {
    return this.shareRepo.findActiveBySharedWithUser(query.userId, {
      page: query.page,
      limit: query.limit,
    });
  }
}
