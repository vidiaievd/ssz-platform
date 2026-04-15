import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetContainerQuery } from './get-container.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_LOCALIZATION_REPOSITORY } from '../../../domain/repositories/container-localization.repository.interface.js';
import type { IContainerLocalizationRepository } from '../../../domain/repositories/container-localization.repository.interface.js';
import { ContainerLocalizationEntity } from '../../../domain/entities/container-localization.entity.js';

export interface GetContainerResult {
  container: ContainerEntity;
  localizations: ContainerLocalizationEntity[];
}

@QueryHandler(GetContainerQuery)
export class GetContainerHandler
  implements IQueryHandler<GetContainerQuery, Result<GetContainerResult, ContainerDomainError>>
{
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_LOCALIZATION_REPOSITORY)
    private readonly localizationRepo: IContainerLocalizationRepository,
  ) {}

  async execute(
    query: GetContainerQuery,
  ): Promise<Result<GetContainerResult, ContainerDomainError>> {
    const container = await this.containerRepo.findById(query.containerId);

    if (!container || container.deletedAt !== null) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const localizations = await this.localizationRepo.findByContainerId(query.containerId);

    return Result.ok({ container, localizations });
  }
}
