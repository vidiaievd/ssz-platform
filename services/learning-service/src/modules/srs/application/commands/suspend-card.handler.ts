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
import { SuspendCardCommand } from './suspend-card.command.js';

@CommandHandler(SuspendCardCommand)
export class SuspendCardHandler
  implements ICommandHandler<SuspendCardCommand, Result<ReviewCardDto, SrsApplicationError>>
{
  private readonly logger = new Logger(SuspendCardHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  async execute(cmd: SuspendCardCommand): Promise<Result<ReviewCardDto, SrsApplicationError>> {
    const card = await this.repo.findById(cmd.cardId);
    if (!card) return Result.fail(new SrsCardNotFoundError(cmd.cardId));
    if (card.userId !== cmd.userId) return Result.fail(new SrsCardUnauthorizedError());

    card.suspend(this.clock.now());
    await this.repo.save(card);
    // Remove from the due queue — suspended cards should not appear.
    await this.dueQueue.invalidate(cmd.userId);

    this.logger.log(`Card ${card.id} suspended by user ${cmd.userId}`);

    for (const event of card.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    card.clearDomainEvents();

    return Result.ok(toReviewCardDto(card));
  }
}
