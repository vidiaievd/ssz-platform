import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../domain/repositories/assignment.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  AssignmentApplicationError,
  AssignmentDomainValidationError,
  AssignmentForbiddenError,
  AssignmentNotFoundError,
} from '../errors/assignment-application.errors.js';
import { toAssignmentDto, type AssignmentDto } from '../dto/assignment.dto.js';
import { UpdateAssignmentDueDateCommand } from './update-assignment-due-date.command.js';

@CommandHandler(UpdateAssignmentDueDateCommand)
export class UpdateAssignmentDueDateHandler
  implements ICommandHandler<UpdateAssignmentDueDateCommand, Result<AssignmentDto, AssignmentApplicationError>>
{
  private readonly logger = new Logger(UpdateAssignmentDueDateHandler.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: UpdateAssignmentDueDateCommand): Promise<Result<AssignmentDto, AssignmentApplicationError>> {
    const assignment = await this.repo.findById(cmd.assignmentId);
    if (!assignment) {
      return Result.fail(new AssignmentNotFoundError(cmd.assignmentId));
    }

    if (assignment.assignerId !== cmd.requestingUserId) {
      return Result.fail(new AssignmentForbiddenError('update due date — only the assigner can do this'));
    }

    const result = assignment.updateDueDate(cmd.newDueAt, this.clock);
    if (result.isFail) {
      return Result.fail(new AssignmentDomainValidationError(result.error.message));
    }

    await this.repo.save(assignment);
    this.logger.log(`Assignment due date updated: ${assignment.id}`);

    for (const event of assignment.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    assignment.clearDomainEvents();

    return Result.ok(toAssignmentDto(assignment));
  }
}
