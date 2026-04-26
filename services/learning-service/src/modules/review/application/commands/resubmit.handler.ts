import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { SUBMISSION_REPOSITORY, type ISubmissionRepository } from '../../domain/repositories/submission.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  SubmissionNotFoundError,
  SubmissionForbiddenError,
  SubmissionDomainValidationError,
  type ReviewApplicationError,
} from '../errors/review-application.errors.js';
import { toSubmissionDto, type SubmissionDto } from '../dto/submission.dto.js';
import { ResubmitCommand } from './resubmit.command.js';

@CommandHandler(ResubmitCommand)
export class ResubmitHandler
  implements ICommandHandler<ResubmitCommand, Result<SubmissionDto, ReviewApplicationError>>
{
  private readonly logger = new Logger(ResubmitHandler.name);

  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly repo: ISubmissionRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: ResubmitCommand): Promise<Result<SubmissionDto, ReviewApplicationError>> {
    const submission = await this.repo.findById(cmd.submissionId);
    if (!submission) {
      return Result.fail(new SubmissionNotFoundError(cmd.submissionId));
    }
    if (submission.userId !== cmd.userId) {
      return Result.fail(new SubmissionForbiddenError('only the original submitter can resubmit'));
    }

    const result = submission.resubmit(cmd.content, this.clock.now());
    if (result.isFail) {
      return Result.fail(new SubmissionDomainValidationError(result.error.message));
    }

    await this.repo.save(submission);
    this.logger.log(`Submission resubmitted: ${submission.id} rev ${submission.currentRevisionNumber}`);

    for (const event of submission.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    submission.clearDomainEvents();

    return Result.ok(toSubmissionDto(submission));
  }
}
