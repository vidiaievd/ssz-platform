import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  SrsCardNotFoundError,
  SrsCardUnauthorizedError,
  type SrsApplicationError,
} from '../errors/srs-application.errors.js';
import { toReviewCardDto, type ReviewCardDto } from '../dto/srs.dto.js';
import { Result } from '../../../../shared/kernel/result.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { UnsuspendCardCommand } from './unsuspend-card.command.js';

@CommandHandler(UnsuspendCardCommand)
export class UnsuspendCardHandler
  implements ICommandHandler<UnsuspendCardCommand, Result<ReviewCardDto, SrsApplicationError>>
{
  private readonly logger = new Logger(UnsuspendCardHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  async execute(cmd: UnsuspendCardCommand): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const card = await this.repo.findById(cmd.cardId);
    if (!card) return Result.fail(new SrsCardNotFoundError(cmd.cardId));
    if (card.userId !== cmd.userId) return Result.fail(new SrsCardUnauthorizedError());

    const now = this.clock.now();
    card.unsuspend(now);
    await this.repo.save(card);
    // Immediately add back to the due queue (unsuspend sets dueAt = now).
    await this.dueQueue.upsert(cmd.userId, card.id, card.dueAt);

    this.logger.log(`Card ${card.id} unsuspended by user ${cmd.userId}`);

    for (const event of card.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    card.clearDomainEvents();

    return Result.ok(toReviewCardDto(card));
  }
}
