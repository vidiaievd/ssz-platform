import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CancelDraftCommand } from './cancel-draft.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';

@CommandHandler(CancelDraftCommand)
export class CancelDraftHandler implements ICommandHandler<
  CancelDraftCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
  ) {}

  async execute(command: CancelDraftCommand): Promise<Result<void, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const cancelResult = version.cancelDraft();
    if (cancelResult.isFail) {
      return Result.fail(cancelResult.error);
    }

    const container = await this.containerRepo.findById(version.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Prevent deleting the only version when the container has never been published.
    // The user must delete the whole container instead.
    if (version.versionNumber === 1 && container.currentPublishedVersionId === null) {
      return Result.fail(ContainerDomainError.CANNOT_CANCEL_ONLY_VERSION);
    }

    // DELETE cascades to container_items via ON DELETE CASCADE.
    await this.versionRepo.delete(command.versionId);

    return Result.ok();
  }
}
