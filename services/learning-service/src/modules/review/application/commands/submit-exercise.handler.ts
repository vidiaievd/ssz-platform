import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Submission } from '../../domain/entities/submission.entity.js';
import { Result } from '../../../../shared/kernel/result.js';
import { SUBMISSION_REPOSITORY, type ISubmissionRepository } from '../../domain/repositories/submission.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { toSubmissionDto, type SubmissionDto } from '../dto/submission.dto.js';
import { type ReviewApplicationError } from '../errors/review-application.errors.js';
import { SubmitExerciseCommand } from './submit-exercise.command.js';

@CommandHandler(SubmitExerciseCommand)
export class SubmitExerciseHandler
  implements ICommandHandler<SubmitExerciseCommand, Result<SubmissionDto, ReviewApplicationError>>
{
  private readonly logger = new Logger(SubmitExerciseHandler.name);

  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly repo: ISubmissionRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: SubmitExerciseCommand): Promise<Result<SubmissionDto, ReviewApplicationError>> {
    const submission = Submission.submit(
      {
        userId: cmd.userId,
        exerciseId: cmd.exerciseId,
        content: cmd.content,
        assignmentId: cmd.assignmentId,
        schoolId: cmd.schoolId,
      },
      this.clock.now(),
    );

    await this.repo.save(submission);
    this.logger.log(`Submission created: ${submission.id}`);

    for (const event of submission.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    submission.clearDomainEvents();

    return Result.ok(toSubmissionDto(submission));
  }
}
