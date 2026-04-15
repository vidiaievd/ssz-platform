import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateDraftFromPublishedCommand } from './create-draft-from-published.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerVersionEntity } from '../../../domain/entities/container-version.entity.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';

export interface CreateDraftFromPublishedResult {
  versionId: string;
  isExisting: boolean;
}

@CommandHandler(CreateDraftFromPublishedCommand)
export class CreateDraftFromPublishedHandler implements ICommandHandler<
  CreateDraftFromPublishedCommand,
  Result<CreateDraftFromPublishedResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
  ) {}

  async execute(
    command: CreateDraftFromPublishedCommand,
  ): Promise<Result<CreateDraftFromPublishedResult, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    if (!container.currentPublishedVersionId) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_PUBLISHED_STATUS);
    }

    // Return the existing draft if one already exists.
    const existingDraft = await this.versionRepo.findDraftByContainerId(command.containerId);
    if (existingDraft) {
      return Result.ok({ versionId: existingDraft.id, isExisting: true });
    }

    // Determine the next version number.
    const allVersions = await this.versionRepo.findByContainerId(command.containerId);
    const nextVersionNumber = Math.max(...allVersions.map((v) => v.versionNumber)) + 1;

    const newDraft = ContainerVersionEntity.create({
      containerId: command.containerId,
      versionNumber: nextVersionNumber,
      createdByUserId: command.userId,
    });

    await this.versionRepo.save(newDraft);

    // Copy all items from the published version into the new draft.
    await this.itemRepo.copyItemsToVersion(container.currentPublishedVersionId, newDraft.id);

    return Result.ok({ versionId: newDraft.id, isExisting: false });
  }
}
