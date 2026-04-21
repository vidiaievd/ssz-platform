import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ArchiveVersionCommand } from './archive-version.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTENT_EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { ContainerArchivedEvent } from '../../../domain/events/container-archived.event.js';

@CommandHandler(ArchiveVersionCommand)
export class ArchiveVersionHandler implements ICommandHandler<
  ArchiveVersionCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTENT_EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: ArchiveVersionCommand): Promise<Result<void, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const archiveResult = version.archive();
    if (archiveResult.isFail) {
      return Result.fail(archiveResult.error);
    }

    await this.versionRepo.save(version);

    await this.eventPublisher.publish(
      'content.container.archived',
      new ContainerArchivedEvent({
        containerId: version.containerId,
        versionId: version.id,
      }),
    );

    return Result.ok();
  }
}
