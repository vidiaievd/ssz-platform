import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateContainerCommand } from './update-container.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@CommandHandler(UpdateContainerCommand)
export class UpdateContainerHandler implements ICommandHandler<
  UpdateContainerCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
  ) {}

  async execute(command: UpdateContainerCommand): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const updateResult = container.update({
      title: command.title,
      description: command.description,
      difficultyLevel: command.difficultyLevel,
      coverImageMediaId: command.coverImageMediaId,
      visibility: command.visibility,
      accessTier: command.accessTier,
    });

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    await this.containerRepo.save(container);

    return Result.ok();
  }
}
