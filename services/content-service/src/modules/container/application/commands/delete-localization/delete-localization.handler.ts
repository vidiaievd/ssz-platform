import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteLocalizationCommand } from './delete-localization.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_LOCALIZATION_REPOSITORY } from '../../../domain/repositories/container-localization.repository.interface.js';
import type { IContainerLocalizationRepository } from '../../../domain/repositories/container-localization.repository.interface.js';

@CommandHandler(DeleteLocalizationCommand)
export class DeleteLocalizationHandler implements ICommandHandler<
  DeleteLocalizationCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_LOCALIZATION_REPOSITORY)
    private readonly localizationRepo: IContainerLocalizationRepository,
  ) {}

  async execute(command: DeleteLocalizationCommand): Promise<Result<void, ContainerDomainError>> {
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

    await this.localizationRepo.delete(localization.id);

    return Result.ok();
  }
}
