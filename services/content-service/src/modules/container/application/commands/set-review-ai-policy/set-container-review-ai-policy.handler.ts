import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SetContainerReviewAiPolicyCommand } from './set-container-review-ai-policy.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import {
  CONTAINER_REPOSITORY,
  type IContainerRepository,
} from '../../../domain/repositories/container.repository.interface.js';
import {
  EXERCISE_TEMPLATE_REPOSITORY,
  type IExerciseTemplateRepository,
} from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import {
  AUDIT_LOG,
  type IAuditLog,
} from '../../../../../shared/application/ports/audit-log.port.js';

/**
 * Who may set it is settled at the edge by `VisibilityGuard` — the course's editors, as
 * for the response promise. Whether the school's plan allows a model at all is not this
 * service's question: the course only shapes a policy the school turns on.
 */
@CommandHandler(SetContainerReviewAiPolicyCommand)
export class SetContainerReviewAiPolicyHandler
  implements ICommandHandler<SetContainerReviewAiPolicyCommand>
{
  constructor(
    @Inject(CONTAINER_REPOSITORY) private readonly containers: IContainerRepository,
    @Inject(EXERCISE_TEMPLATE_REPOSITORY) private readonly templates: IExerciseTemplateRepository,
    @Inject(AUDIT_LOG) private readonly auditLog: IAuditLog,
  ) {}

  async execute(
    command: SetContainerReviewAiPolicyCommand,
  ): Promise<Result<void, ContainerDomainError>> {
    const container = await this.containers.findById(command.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    // A misspelt code would match no attempt, and the work it meant would quietly go to
    // the model instead of the teacher.
    for (const code of new Set(command.teacherReviewTemplates)) {
      if (!(await this.templates.findByCode(code))) {
        return Result.fail(ContainerDomainError.UNKNOWN_EXERCISE_TEMPLATE);
      }
    }

    const applied = container.setReviewAiPolicy(
      command.autoAcceptAfterHours,
      command.teacherReviewTemplates,
    );
    if (applied.isFail) return Result.fail(applied.error);

    await this.containers.save(container);

    await this.auditLog.record({
      entityType: 'CONTAINER',
      entityId: command.containerId,
      action: 'updated',
      actorUserId: command.userId,
      changedFields: ['reviewAutoAcceptAfterHours', 'reviewTeacherTemplates'],
    });

    return Result.ok();
  }
}
