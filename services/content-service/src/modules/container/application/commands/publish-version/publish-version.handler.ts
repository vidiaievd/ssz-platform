import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PublishVersionCommand } from './publish-version.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { Visibility } from '../../../domain/value-objects/visibility.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../../domain/repositories/container-item.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { ContainerPublishedEvent } from '../../../domain/events/container-published.event.js';
import { ContainerDeprecatedEvent } from '../../../domain/events/container-deprecated.event.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

const DEFAULT_SUNSET_DAYS = 90;

export interface PublishVersionResult {
  versionId: string;
  previousVersionId: string | null;
}

@CommandHandler(PublishVersionCommand)
export class PublishVersionHandler implements ICommandHandler<
  PublishVersionCommand,
  Result<PublishVersionResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(
    command: PublishVersionCommand,
  ): Promise<Result<PublishVersionResult, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const container = await this.containerRepo.findById(version.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    if (container.ownerUserId !== command.userId) {
      return Result.fail(ContainerDomainError.INSUFFICIENT_PERMISSIONS);
    }

    // Must have at least one item to publish.
    const items = await this.itemRepo.findByVersionId(command.versionId);
    if (items.length === 0) {
      return Result.fail(ContainerDomainError.CANNOT_PUBLISH_EMPTY_VERSION);
    }

    // Check for broken container references (other item types validated in future prompts).
    for (const item of items) {
      if (item.itemType === ('container' as never)) {
        const ref = await this.containerRepo.findById(item.itemId);
        if (!ref || ref.deletedAt !== null) {
          return Result.fail(ContainerDomainError.CANNOT_PUBLISH_WITH_BROKEN_REFERENCES);
        }
      }
    }

    const previousVersionId = container.currentPublishedVersionId;
    const sunsetDays = command.sunsetPeriodDays ?? DEFAULT_SUNSET_DAYS;

    // Resolve slug if this is the first publication of a public container.
    let slug: string | undefined;
    if (
      container.currentPublishedVersionId === null &&
      container.visibility === Visibility.PUBLIC
    ) {
      const base = generateSlug(container.title);
      slug = await resolveUniqueSlug(base, async (candidate) => {
        const existing = await this.containerRepo.findBySlug(candidate);
        return existing !== null;
      });
    }

    const { sunsetAt } = await this.versionRepo.publishVersion({
      versionId: command.versionId,
      containerId: container.id,
      previousVersionId,
      sunsetDays,
      publishedByUserId: command.userId,
      slug,
    });

    // Publish domain events.
    await this.eventPublisher.publish(
      'content.container.published',
      new ContainerPublishedEvent({
        containerId: container.id,
        newVersionId: command.versionId,
        previousVersionId,
        versionNumber: version.versionNumber,
      }),
    );

    if (previousVersionId && sunsetAt) {
      await this.eventPublisher.publish(
        'content.container.deprecated',
        new ContainerDeprecatedEvent({
          containerId: container.id,
          versionId: previousVersionId,
          sunsetAt,
        }),
      );
    }

    return Result.ok({ versionId: command.versionId, previousVersionId });
  }
}
