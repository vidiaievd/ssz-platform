import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateContainerCommand } from './update-container.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import { AUDIT_LOG } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IAuditLog } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

@CommandHandler(UpdateContainerCommand)
export class UpdateContainerHandler implements ICommandHandler<
  UpdateContainerCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(AUDIT_LOG)
    private readonly auditLog: IAuditLog,
  ) {}

  async execute(command: UpdateContainerCommand): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containerRepo.findById(command.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const updateResult = container.update({
      title: command.title,
      description: command.description,
      difficultyLevel: command.difficultyLevel,
      coverImageMediaId: command.coverImageMediaId,
      visibility: command.visibility,
      accessTier: command.accessTier,
      levelSystem: command.levelSystem,
      gatingMode: command.gatingMode,
    });

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    await this.containerRepo.save(container);

    await this.auditLog.record({
      entityType: 'CONTAINER',
      entityId: command.containerId,
      action: 'updated',
      actorUserId: command.userId,
      changedFields: changedContainerFields(command),
    });

    return Result.ok();
  }
}

/**
 * The fields the caller actually set. `undefined` means "not part of this
 * request" throughout the update DTO, so absence is the honest test — comparing
 * against the stored values instead would drop a field re-saved with the same
 * content, which the author did do and does expect to see in the history.
 */
function changedContainerFields(command: UpdateContainerCommand): string[] {
  const fields: Array<keyof UpdateContainerCommand> = [
    'title',
    'description',
    'difficultyLevel',
    'coverImageMediaId',
    'visibility',
    'accessTier',
    'levelSystem',
    'gatingMode',
  ];
  return fields.filter((field) => command[field] !== undefined);
}
