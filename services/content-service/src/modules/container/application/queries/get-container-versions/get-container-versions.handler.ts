import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetContainerVersionsQuery } from './get-container-versions.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';

@QueryHandler(GetContainerVersionsQuery)
export class GetContainerVersionsHandler implements IQueryHandler<
  GetContainerVersionsQuery,
  Result<ContainerVersionEntity[], ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
  ) {}

  async execute(
    query: GetContainerVersionsQuery,
  ): Promise<Result<ContainerVersionEntity[], ContainerDomainError>> {
    const container = await this.containerRepo.findById(query.containerId);
    if (!container || container.deletedAt !== null) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const versions = await this.versionRepo.findByContainerId(query.containerId);
    return Result.ok(versions);
  }
}
