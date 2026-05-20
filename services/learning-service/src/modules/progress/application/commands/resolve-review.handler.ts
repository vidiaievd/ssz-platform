import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  ProgressNotFoundError,
  ProgressDomainValidationError,
  type ProgressApplicationError,
} from '../errors/progress-application.errors.js';
import { toProgressDto, type ProgressDto } from '../dto/progress.dto.js';
import { ResolveReviewCommand } from './resolve-review.command.js';

@CommandHandler(ResolveReviewCommand)
export class ResolveReviewHandler
  implements ICommandHandler<ResolveReviewCommand, Result<ProgressDto, ProgressApplicationError>>
{
  private readonly logger = new Logger(ResolveReviewHandler.name);

  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly repo: IProgressRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: ResolveReviewCommand): Promise<Result<ProgressDto, ProgressApplicationError>> {
    const progress = await this.repo.findByUserAndContent(cmd.userId, cmd.contentType, cmd.contentId);
    if (!progress) {
      return Result.fail(new ProgressNotFoundError(`${cmd.contentType}:${cmd.contentId} for user ${cmd.userId}`));
    }

    const result = progress.resolveReview(cmd.approved, this.clock.now());
    if (result.isFail) {
      return Result.fail(new ProgressDomainValidationError(result.error.message));
    }

    await this.repo.save(progress);
    this.logger.log(`Progress review resolved (approved=${cmd.approved}): ${progress.id}`);

    for (const event of progress.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    progress.clearDomainEvents();

    return Result.ok(toProgressDto(progress));
  }
}
