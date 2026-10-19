import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { MoveContainerItemCommand } from './move-container-item.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { ContainerItemType } from '../../../domain/value-objects/item-type.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';
import { CONTAINER_ITEM_MOVER } from '../../ports/container-item-mover.port.js';
import type { IContainerItemMover } from '../../ports/container-item-mover.port.js';
import { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

export interface MoveContainerItemResult {
  /** The new row, in the target container's draft. */
  itemId: string;
  position: number;
}

/**
 * Moves a block to another container's draft (plan 39, B3) — the material stays the
 * same lesson, exercise, list or rule; only the row placing it changes hands.
 *
 * Learners do not see the move until both containers are published: each keeps
 * serving its published version, so between the two publishes the block is either
 * in both or in neither. Progress is not at stake — learning-service keys it by the
 * material, not by the row.
 */
@CommandHandler(MoveContainerItemCommand)
export class MoveContainerItemHandler implements ICommandHandler<
  MoveContainerItemCommand,
  Result<MoveContainerItemResult, ContainerDomainError>
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
    @Inject(CONTAINER_ITEM_MOVER)
    private readonly mover: IContainerItemMover,
    private readonly registry: EntityResolverRegistry,
    private readonly checker: VisibilityCheckerService,
  ) {}

  async execute(
    command: MoveContainerItemCommand,
  ): Promise<Result<MoveContainerItemResult, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    if (!version || version.containerId !== command.containerId) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }
    if (version.status !== VersionStatus.DRAFT) {
      return Result.fail(ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION);
    }

    const row = await this.itemRepo.findById(command.rowId);
    if (!row || row.containerVersionId !== command.versionId) {
      return Result.fail(ContainerDomainError.ITEM_NOT_FOUND);
    }
    // A module row is the course's own structure; it moves between levels, which
    // are sections of the same course.
    if (row.itemType === ContainerItemType.CONTAINER) {
      return Result.fail(ContainerDomainError.ITEM_TYPE_NOT_MOVABLE);
    }
    // Within one container a block changes section, not draft.
    if (command.targetContainerId === command.containerId) {
      return Result.fail(ContainerDomainError.MOVE_TARGET_IS_SOURCE);
    }

    const target = await this.containerRepo.findById(command.targetContainerId);
    if (!target || target.deletedAt !== null) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    // The route guard checked the container in the path; the move also writes into
    // a second one. Without this, edit rights on any module would let a caller push
    // blocks into every module in the service.
    const targetEntity = await this.registry.resolve(
      TaggableEntityType.CONTAINER,
      command.targetContainerId,
    );
    if (!targetEntity) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }
    const decision = await this.checker.canAccess(command.user, targetEntity, 'edit');
    if (!decision.allowed) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const targetDraft = await this.versionRepo.findDraftByContainerId(command.targetContainerId);
    if (!targetDraft) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    if (command.targetSectionId !== null) {
      const section = await this.sectionRepo.findById(command.targetSectionId);
      if (!section) {
        return Result.fail(ContainerDomainError.SECTION_NOT_FOUND);
      }
      if (section.containerVersionId !== targetDraft.id) {
        return Result.fail(ContainerDomainError.SECTION_BELONGS_TO_DIFFERENT_VERSION);
      }
    }

    const moved = await this.mover.moveRow({
      sourceVersionId: command.versionId,
      rowId: command.rowId,
      targetVersionId: targetDraft.id,
      targetSectionId: command.targetSectionId,
    });
    // The row went away between the reads above and the transaction.
    if (!moved) {
      return Result.fail(ContainerDomainError.ITEM_NOT_FOUND);
    }

    return Result.ok({ itemId: moved.rowId, position: moved.position });
  }
}
