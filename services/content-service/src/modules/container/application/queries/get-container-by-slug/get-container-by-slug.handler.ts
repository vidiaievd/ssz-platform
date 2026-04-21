import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetContainerBySlugQuery } from './get-container-by-slug.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@QueryHandler(GetContainerBySlugQuery)
export class GetContainerBySlugHandler implements IQueryHandler<
  GetContainerBySlugQuery,
  Result<ContainerEntity, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
  ) {}

  async execute(
    query: GetContainerBySlugQuery,
  ): Promise<Result<ContainerEntity, ContainerDomainError>> {
    const container = await this.containerRepo.findBySlug(query.slug);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }
    return Result.ok(container);
  }
}
