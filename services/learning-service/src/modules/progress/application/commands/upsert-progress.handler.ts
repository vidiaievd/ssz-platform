import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UserProgress } from '../../domain/entities/user-progress.entity.js';
import { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../shared/kernel/result.js';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  InvalidProgressContentRefError,
  type ProgressApplicationError,
} from '../errors/progress-application.errors.js';
import { toProgressDto, type ProgressDto } from '../dto/progress.dto.js';
import { UpsertProgressCommand } from './upsert-progress.command.js';

@CommandHandler(UpsertProgressCommand)
export class UpsertProgressHandler
  implements ICommandHandler<UpsertProgressCommand, Result<ProgressDto, ProgressApplicationError>>
{
  private readonly logger = new Logger(UpsertProgressHandler.name);

  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly repo: IProgressRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(cmd: UpsertProgressCommand): Promise<Result<ProgressDto, ProgressApplicationError>> {
    const refResult = ContentRef.create(cmd.contentType as any, cmd.contentId);
    if (refResult.isFail) {
      return Result.fail(new InvalidProgressContentRefError(refResult.error.message));
    }
    const contentRef = refResult.value;

    let progress = await this.repo.findByUserAndContent(cmd.userId, cmd.contentType, cmd.contentId);
    if (!progress) {
      progress = UserProgress.create(cmd.userId, contentRef);
    }

    progress.recordAttempt({
      timeSpentSeconds: cmd.timeSpentSeconds,
      score: cmd.score,
      completed: cmd.completed,
      now: this.clock.now(),
    });

    await this.repo.save(progress);
    this.logger.log(`Progress upserted for user ${cmd.userId} on ${cmd.contentType}:${cmd.contentId}`);

    for (const event of progress.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    progress.clearDomainEvents();

    return Result.ok(toProgressDto(progress));
  }
}
