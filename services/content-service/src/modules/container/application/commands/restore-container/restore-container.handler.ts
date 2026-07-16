import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RestoreContainerCommand } from './restore-container.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@CommandHandler(RestoreContainerCommand)
export class RestoreContainerHandler implements ICommandHandler<
  RestoreContainerCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
  ) {}

  async execute(command: RestoreContainerCommand): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const restoreResult = container.restore();
    if (restoreResult.isFail) {
      return Result.fail(restoreResult.error);
    }

    await this.containerRepo.save(container);

    return Result.ok();
  }
}
