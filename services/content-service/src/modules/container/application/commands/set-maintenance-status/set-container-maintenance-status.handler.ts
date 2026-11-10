import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetContainerMaintenanceStatusCommand } from './set-container-maintenance-status.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { ContainerEntity } from '../../../domain/entities/container.entity.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  AUDIT_LOG,
  type IAuditLog,
} from '../../../../../shared/application/ports/audit-log.port.js';

/**
 * Who may set it is settled at the edge by `VisibilityGuard` — the course's editors.
 * Answers the course as it now stands, so the screen shows what was saved.
 */
@CommandHandler(SetContainerMaintenanceStatusCommand)
export class SetContainerMaintenanceStatusHandler
  implements ICommandHandler<SetContainerMaintenanceStatusCommand>
{
  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    @Inject(AUDIT_LOG) private readonly auditLog: IAuditLog,
  ) {}

  async execute(
    command: SetContainerMaintenanceStatusCommand,
  ): Promise<Result<ContainerEntity, ContainerDomainError>> {
    const container = await this.containers.findById(command.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const applied = container.setMaintenanceByAuthor(command.status);
    if (applied.isFail) return Result.fail(applied.error);

    // Nothing to write when the course already stood where the author put it.
    if (!applied.value) return Result.ok(container);

    const saved = await this.containers.save(container);

    await this.auditLog.record({
      entityType: 'CONTAINER',
      entityId: command.containerId,
      action: 'updated',
      actorUserId: command.userId,
      changedFields: ['maintenanceStatus'],
    });

    return Result.ok(saved);
  }
}
