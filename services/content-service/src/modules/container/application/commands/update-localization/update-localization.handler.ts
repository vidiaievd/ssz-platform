import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateLocalizationCommand } from './update-localization.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_LOCALIZATION_REPOSITORY } from '../../../domain/repositories/container-localization.repository.interface.js';
import type { IContainerLocalizationRepository } from '../../../domain/repositories/container-localization.repository.interface.js';

@CommandHandler(UpdateLocalizationCommand)
export class UpdateLocalizationHandler
  implements ICommandHandler<UpdateLocalizationCommand, Result<void, ContainerDomainError>>
{
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_LOCALIZATION_REPOSITORY)
    private readonly localizationRepo: IContainerLocalizationRepository,
  ) {}

  async execute(
    command: UpdateLocalizationCommand,
  ): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const localization = await this.localizationRepo.findByContainerAndLanguage(
      command.containerId,
      command.languageCode,
    );
    if (!localization) {
      return Result.fail(ContainerDomainError.LOCALIZATION_NOT_FOUND);
    }

    localization.update({
      title: command.title,
      description: command.description,
    });

    await this.localizationRepo.save(localization);

    return Result.ok();
  }
}
