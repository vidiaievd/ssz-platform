import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { AddContainerItemCommand } from './add-container-item.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';

export interface AddContainerItemResult {
  itemId: string;
  position: number;
}

@CommandHandler(AddContainerItemCommand)
export class AddContainerItemHandler implements ICommandHandler<
  AddContainerItemCommand,
  Result<AddContainerItemResult, ContainerDomainError>
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
    command: AddContainerItemCommand,
  ): Promise<Result<AddContainerItemResult, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    if (version.status !== VersionStatus.DRAFT) {
      return Result.fail(ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION);
    }

    const container = await this.containerRepo.findById(version.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Resolve position: use provided value or append after last item.
    let position: number;
    if (command.position !== undefined) {
      // Verify the position is not already occupied.
      const existing = await this.itemRepo.findByVersionId(command.versionId);
      const occupied = existing.some((i) => i.position === command.position);
      if (occupied) {
        return Result.fail(ContainerDomainError.DUPLICATE_ITEM_POSITION);
      }
      position = command.position;
    } else {
      position = (await this.itemRepo.getMaxPosition(command.versionId)) + 1;
    }

    const item = ContainerItemEntity.create({
      containerVersionId: command.versionId,
      position,
      itemType: command.itemType,
      itemId: command.itemId,
      isRequired: command.isRequired,
      sectionLabel: command.sectionLabel,
    });

    await this.itemRepo.save(item);

    version.incrementRevision();
    await this.versionRepo.save(version);

    return Result.ok({ itemId: item.id, position });
  }
}
