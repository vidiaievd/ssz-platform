import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetContainersQuery } from './get-containers.query.js';
import { PaginatedResult } from '../../../../../shared/kernel/pagination.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@QueryHandler(GetContainersQuery)
export class GetContainersHandler implements IQueryHandler<
  GetContainersQuery,
  PaginatedResult<ContainerEntity>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
  ) {}

  async execute(query: GetContainersQuery): Promise<PaginatedResult<ContainerEntity>> {
    return this.containerRepo.findAll(query.filter);
  }
}
