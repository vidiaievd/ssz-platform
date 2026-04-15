import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateLocalizationCommand } from './create-localization.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerLocalizationEntity } from '../../../domain/entities/container-localization.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_LOCALIZATION_REPOSITORY } from '../../../domain/repositories/container-localization.repository.interface.js';
import type { IContainerLocalizationRepository } from '../../../domain/repositories/container-localization.repository.interface.js';

export interface CreateLocalizationResult {
  localizationId: string;
}

@CommandHandler(CreateLocalizationCommand)
export class CreateLocalizationHandler implements ICommandHandler<
  CreateLocalizationCommand,
  Result<CreateLocalizationResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_LOCALIZATION_REPOSITORY)
    private readonly localizationRepo: IContainerLocalizationRepository,
  ) {}

  async execute(
    command: CreateLocalizationCommand,
  ): Promise<Result<CreateLocalizationResult, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const existing = await this.localizationRepo.findByContainerAndLanguage(
      command.containerId,
      command.languageCode,
    );
    if (existing) {
      return Result.fail(ContainerDomainError.LOCALIZATION_ALREADY_EXISTS);
    }

    const localization = ContainerLocalizationEntity.create({
      containerId: command.containerId,
      languageCode: command.languageCode,
      title: command.title,
      description: command.description,
      createdByUserId: command.userId,
    });

    await this.localizationRepo.save(localization);

    return Result.ok({ localizationId: localization.id });
  }
}
