import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateContainerCommand } from './create-container.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerEntity } from '../../../domain/entities/container.entity.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { getDefaultAccessTier } from '../../../domain/value-objects/access-tier.vo.js';

export interface CreateContainerResult {
  containerId: string;
  versionId: string;
}

@CommandHandler(CreateContainerCommand)
export class CreateContainerHandler implements ICommandHandler<
  CreateContainerCommand,
  Result<CreateContainerResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
  ) {}

  async execute(
    command: CreateContainerCommand,
  ): Promise<Result<CreateContainerResult, ContainerDomainError>> {
    const accessTier = command.accessTier ?? getDefaultAccessTier(command.visibility);

    const containerResult = ContainerEntity.create({
      containerType: command.containerType,
      targetLanguage: command.targetLanguage,
      difficultyLevel: command.difficultyLevel,
      title: command.title,
      description: command.description,
      coverImageMediaId: command.coverImageMediaId,
      ownerUserId: command.userId,
      ownerSchoolId: command.ownerSchoolId,
      visibility: command.visibility,
      accessTier,
    });

    if (containerResult.isFail) {
      return Result.fail(containerResult.error);
    }

    const container = containerResult.value;

    const version = ContainerVersionEntity.create({
      containerId: container.id,
      versionNumber: 1,
      createdByUserId: command.userId,
    });

    // Save container first (version has FK to container).
    await this.containerRepo.save(container);
    await this.versionRepo.save(version);

    return Result.ok({ containerId: container.id, versionId: version.id });
  }
}
