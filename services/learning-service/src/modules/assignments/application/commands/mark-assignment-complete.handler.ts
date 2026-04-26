import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import {
  AssignmentApplicationError,
  AssignmentDomainValidationError,
  AssignmentNotFoundError,
} from '../errors/assignment-application.errors.js';
import { MarkAssignmentCompleteCommand } from './mark-assignment-complete.command.js';

@CommandHandler(MarkAssignmentCompleteCommand)
export class MarkAssignmentCompleteHandler
  implements ICommandHandler<MarkAssignmentCompleteCommand, Result<void, AssignmentApplicationError>>
{
  private readonly logger = new Logger(MarkAssignmentCompleteHandler.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: MarkAssignmentCompleteCommand): Promise<Result<void, AssignmentApplicationError>> {
    const assignment = await this.repo.findById(cmd.assignmentId);
    if (!assignment) {
      // Progress event fired before assignment loaded — treat as no-op
      this.logger.warn(`MarkAssignmentComplete: assignment not found ${cmd.assignmentId}`);
      return Result.ok();
    }

    const result = assignment.markComplete();
    if (result.isFail) {
      return Result.fail(new AssignmentDomainValidationError(result.error.message));
    }

    await this.repo.save(assignment);
    this.logger.log(`Assignment marked complete: ${assignment.id}`);

    for (const event of assignment.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    assignment.clearDomainEvents();

    return Result.ok();
  }
}
