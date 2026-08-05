import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RollbackToVersionCommand } from './rollback-to-version.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { ContainerPublishedEvent } from '../../../domain/events/container-published.event.js';
import { ContainerDeprecatedEvent } from '../../../domain/events/container-deprecated.event.js';

const DEFAULT_SUNSET_DAYS = 90;

export interface RollbackToVersionResult {
  versionId: string;
  previousVersionId: string | null;
}

/**
 * Puts a superseded version back on air, exactly as it was.
 *
 * Nothing is copied and no draft is touched: the point of a rollback is to undo
 * a bad release *now*, without an editorial round trip. The draft the author is
 * working in keeps whatever it holds, and publishing it later moves forward
 * again from there.
 *
 * What it restores is composition — which items the container holds, in what
 * order. Item content (an exercise's text, a lesson's body) is a shared row
 * that every version points at, so a rewritten exercise stays rewritten. That
 * is the model, not an oversight (plan 33 §1).
 */
@CommandHandler(RollbackToVersionCommand)
export class RollbackToVersionHandler implements ICommandHandler<
  RollbackToVersionCommand,
  Result<RollbackToVersionResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(
    command: RollbackToVersionCommand,
  ): Promise<Result<RollbackToVersionResult, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const version = await this.versionRepo.findById(command.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    // The guard authorizes the container in the URL; a version id from another
    // container would otherwise publish content the caller has no rights over.
    if (version.containerId !== container.id) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    // Only a superseded version can come back. A draft was never live, and the
    // current one is already live.
    if (version.status !== VersionStatus.DEPRECATED) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_DEPRECATED_STATUS);
    }

    const previousVersionId = container.currentPublishedVersionId;
    const sunsetDays = command.sunsetPeriodDays ?? DEFAULT_SUNSET_DAYS;

    const { sunsetAt } = await this.versionRepo.rollbackToVersion({
      versionId: version.id,
      containerId: container.id,
      previousVersionId,
      sunsetDays,
      publishedByUserId: command.userId,
    });

    // Same events as a publish: for every consumer downstream this *is* a
    // publish — a different version is live from now on.
    await this.eventPublisher.publish(
      'content.container.published',
      new ContainerPublishedEvent({
        containerId: container.id,
        newVersionId: version.id,
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

    return Result.ok({ versionId: version.id, previousVersionId });
  }
}
