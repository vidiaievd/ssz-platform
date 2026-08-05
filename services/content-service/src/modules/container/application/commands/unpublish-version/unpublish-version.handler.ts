import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UnpublishVersionCommand } from './unpublish-version.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { VersionUnpublishedEvent } from '../../../domain/events/version-unpublished.event.js';

@CommandHandler(UnpublishVersionCommand)
export class UnpublishVersionHandler implements ICommandHandler<
  UnpublishVersionCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: UnpublishVersionCommand): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const version = await this.versionRepo.findPublishedByContainerId(command.containerId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_PUBLISHED_STATUS);
    }

    const unpublishResult = version.unpublish();
    if (unpublishResult.isFail) {
      return Result.fail(unpublishResult.error);
    }

    await this.versionRepo.unpublishVersion({
      versionId: version.id,
      containerId: container.id,
    });

    await this.eventPublisher.publish(
      'content.version.unpublished',
      new VersionUnpublishedEvent({
        containerId: container.id,
        versionId: version.id,
      }),
    );

    return Result.ok();
  }
}
