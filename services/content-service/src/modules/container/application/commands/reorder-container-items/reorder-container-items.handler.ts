import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReorderContainerItemsCommand } from './reorder-container-items.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';

@CommandHandler(ReorderContainerItemsCommand)
export class ReorderContainerItemsHandler implements ICommandHandler<
  ReorderContainerItemsCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
    @Inject(CONTAINER_SECTION_REPOSITORY)
    private readonly sectionRepo: IContainerSectionRepository,
  ) {}

  async execute(
    command: ReorderContainerItemsCommand,
  ): Promise<Result<void, ContainerDomainError>> {
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

    const existingItems = await this.itemRepo.findByVersionId(command.versionId);
    const existingIds = new Set(existingItems.map((i) => i.id));

    // Validate: all provided IDs must belong to this version.
    for (const item of command.items) {
      if (!existingIds.has(item.id)) {
        return Result.fail(ContainerDomainError.ITEM_NOT_FOUND);
      }
    }

    // Validate: positions must be unique and form a continuous 0-based sequence.
    const positions = command.items.map((i) => i.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i) {
        return Result.fail(ContainerDomainError.DUPLICATE_ITEM_POSITION);
      }
    }

    // Validate: the reorder payload must cover all items in the version.
    if (command.items.length !== existingItems.length) {
      return Result.fail(ContainerDomainError.DUPLICATE_ITEM_POSITION);
    }

    // Validate: any explicit sectionId (move-between-sections) must reference
    // a section belonging to this same version.
    const explicitSectionIds = command.items
      .filter((i) => 'sectionId' in i && i.sectionId !== undefined && i.sectionId !== null)
      .map((i) => i.sectionId as string);
    if (explicitSectionIds.length > 0) {
      const existingSections = await this.sectionRepo.findByVersionId(command.versionId);
      const existingSectionIds = new Set(existingSections.map((s) => s.id));
      for (const sectionId of explicitSectionIds) {
        if (!existingSectionIds.has(sectionId)) {
          return Result.fail(ContainerDomainError.SECTION_NOT_FOUND);
        }
      }
    }

    await this.itemRepo.reorder(command.versionId, command.items);

    version.incrementRevision();
    await this.versionRepo.save(version);

    return Result.ok();
  }
}
