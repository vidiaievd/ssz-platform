import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DuplicateContainerItemCommand } from './duplicate-container-item.command.js';
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
import { CONTAINER_ITEM_DUPLICATOR } from '../../ports/container-item-duplicator.port.js';
import type {
  CopiedExercise,
  DuplicateRowInput,
  IContainerItemDuplicator,
} from '../../ports/container-item-duplicator.port.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { ExerciseCreatedEvent } from '../../../../exercise/domain/events/exercise-created.event.js';
import { LessonCreatedEvent } from '../../../../lesson/domain/events/lesson-created.event.js';
import { LessonVariantCreatedEvent } from '../../../../lesson/domain/events/lesson-variant-created.event.js';
import type { IDomainEvent } from '../../../../../shared/domain/domain-event.interface.js';

export interface DuplicateContainerItemResult {
  /** The new row. */
  itemId: string;
  position: number;
  /** The copied material the new row places. */
  materialId: string;
}

/**
 * Duplicates a row of a draft version together with the material it places (plan 39,
 * B1): exercises (plan 76, B1.3) and lessons (B1.4). Vocabulary lists and grammar rules
 * are refused — the editor offers "Place again" for those.
 */
@CommandHandler(DuplicateContainerItemCommand)
export class DuplicateContainerItemHandler implements ICommandHandler<
  DuplicateContainerItemCommand,
  Result<DuplicateContainerItemResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
    @Inject(CONTAINER_ITEM_DUPLICATOR)
    private readonly duplicator: IContainerItemDuplicator,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(
    command: DuplicateContainerItemCommand,
  ): Promise<Result<DuplicateContainerItemResult, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    // The guard checked the container in the route, so a version of another container
    // is as good as missing — otherwise edit rights on one module would reach any other.
    if (!version || version.containerId !== command.containerId) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    if (version.status !== VersionStatus.DRAFT) {
      return Result.fail(ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION);
    }

    const container = await this.containerRepo.findById(version.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const row = await this.itemRepo.findById(command.rowId);
    if (!row || row.containerVersionId !== command.versionId) {
      return Result.fail(ContainerDomainError.ITEM_NOT_FOUND);
    }

    const input: DuplicateRowInput = {
      versionId: command.versionId,
      rowId: command.rowId,
      userId: command.userId,
      ownerSchoolId: container.ownerSchoolId,
      visibility: container.visibility,
    };

    let duplicated: DuplicateContainerItemResult;
    const events: IDomainEvent[] = [];
    switch (row.itemType) {
      case ContainerItemType.EXERCISE: {
        const copy = await this.duplicator.duplicateExerciseRow(input);
        // The row or its exercise went away between the reads above and the transaction.
        if (!copy) {
          return Result.fail(ContainerDomainError.ITEM_NOT_FOUND);
        }
        events.push(this.exerciseCreated(copy, input));
        duplicated = { itemId: copy.rowId, position: copy.position, materialId: copy.exerciseId };
        break;
      }
      case ContainerItemType.LESSON: {
        const copy = await this.duplicator.duplicateLessonRow(input);
        if (!copy) {
          return Result.fail(ContainerDomainError.ITEM_NOT_FOUND);
        }
        events.push(
          new LessonCreatedEvent({
            lessonId: copy.lessonId,
            ownerUserId: input.userId,
            ownerSchoolId: input.ownerSchoolId,
            targetLanguage: copy.targetLanguage,
            visibility: input.visibility,
          }),
          ...copy.variants.map(
            (variant) => new LessonVariantCreatedEvent({ lessonId: copy.lessonId, ...variant }),
          ),
          ...copy.exercises.map((exercise) => this.exerciseCreated(exercise, input)),
        );
        duplicated = { itemId: copy.rowId, position: copy.position, materialId: copy.lessonId };
        break;
      }
      default:
        return Result.fail(ContainerDomainError.ITEM_TYPE_NOT_DUPLICABLE);
    }

    version.incrementRevision();
    await this.versionRepo.save(version);

    for (const event of events) {
      await this.eventPublisher.publish(event.eventType, event);
    }

    return Result.ok(duplicated);
  }

  private exerciseCreated(copy: CopiedExercise, input: DuplicateRowInput): ExerciseCreatedEvent {
    return new ExerciseCreatedEvent({
      exerciseId: copy.exerciseId,
      templateCode: copy.templateCode,
      ownerUserId: input.userId,
      ownerSchoolId: input.ownerSchoolId,
      targetLanguage: copy.targetLanguage,
      visibility: input.visibility,
    });
  }
}
