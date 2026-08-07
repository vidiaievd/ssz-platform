import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RestoreContainerCommand } from './restore-container.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import { AUDIT_LOG } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IAuditLog } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@CommandHandler(RestoreContainerCommand)
export class RestoreContainerHandler implements ICommandHandler<
  RestoreContainerCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(AUDIT_LOG)
    private readonly auditLog: IAuditLog,
  ) {}

  async execute(command: RestoreContainerCommand): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const restoreResult = container.restore();
    if (restoreResult.isFail) {
      return Result.fail(restoreResult.error);
    }

    await this.containerRepo.save(container);

    await this.auditLog.record({
      entityType: 'CONTAINER',
      entityId: command.containerId,
      action: 'restored',
      actorUserId: command.userId,
    });

    return Result.ok();
  }
}
