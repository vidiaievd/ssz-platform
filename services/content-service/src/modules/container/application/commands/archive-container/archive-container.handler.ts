import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ArchiveContainerCommand } from './archive-container.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import { AUDIT_LOG } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IAuditLog } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@CommandHandler(ArchiveContainerCommand)
export class ArchiveContainerHandler implements ICommandHandler<
  ArchiveContainerCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(AUDIT_LOG)
    private readonly auditLog: IAuditLog,
  ) {}

  async execute(command: ArchiveContainerCommand): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const archiveResult = container.archive();
    if (archiveResult.isFail) {
      return Result.fail(archiveResult.error);
    }

    await this.containerRepo.save(container);

    await this.auditLog.record({
      entityType: 'CONTAINER',
      entityId: command.containerId,
      action: 'archived',
      actorUserId: command.userId,
    });

    return Result.ok();
  }
}
