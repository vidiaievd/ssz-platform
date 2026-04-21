import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVersionItemsQuery } from './get-version-items.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';

@QueryHandler(GetVersionItemsQuery)
export class GetVersionItemsHandler implements IQueryHandler<
  GetVersionItemsQuery,
  Result<ContainerItemEntity[], ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
  ) {}

  async execute(
    query: GetVersionItemsQuery,
  ): Promise<Result<ContainerItemEntity[], ContainerDomainError>> {
    const version = await this.versionRepo.findById(query.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const items = await this.itemRepo.findByVersionId(query.versionId);
    return Result.ok(items);
  }
}
