import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetContainerVersionQuery } from './get-container-version.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';

@QueryHandler(GetContainerVersionQuery)
export class GetContainerVersionHandler implements IQueryHandler<
  GetContainerVersionQuery,
  Result<ContainerVersionEntity, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
  ) {}

  async execute(
    query: GetContainerVersionQuery,
  ): Promise<Result<ContainerVersionEntity, ContainerDomainError>> {
    const version = await this.versionRepo.findById(query.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }
    return Result.ok(version);
  }
}
