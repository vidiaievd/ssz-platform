import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SetContainerCoverageRecipeCommand } from './set-container-coverage-recipe.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  AUDIT_LOG,
  type IAuditLog,
} from '../../../../../shared/application/ports/audit-log.port.js';

/** Who may set it is settled at the edge by `VisibilityGuard` — the course's editors. */
@CommandHandler(SetContainerCoverageRecipeCommand)
export class SetContainerCoverageRecipeHandler implements ICommandHandler<SetContainerCoverageRecipeCommand> {
  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    @Inject(AUDIT_LOG) private readonly auditLog: IAuditLog,
  ) {}

  async execute(
    command: SetContainerCoverageRecipeCommand,
  ): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containers.findById(command.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const applied = container.setCoverageRecipe(command.recipe);
    if (applied.isFail) return Result.fail(applied.error);

    await this.containers.save(container);

    await this.auditLog.record({
      entityType: 'CONTAINER',
      entityId: command.containerId,
      action: 'updated',
      actorUserId: command.userId,
      changedFields: ['coverageRecipe'],
    });

    return Result.ok();
  }
}
