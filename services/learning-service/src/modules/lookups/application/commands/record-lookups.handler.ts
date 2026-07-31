import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { LEARNING_EVENT_TYPES, type VocabularyLookedUpPayload } from '@ssz/contracts';
import {
  LEARNING_EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  SRS_REPOSITORY,
  type ISrsRepository,
} from '../../../srs/domain/repositories/srs-repository.interface.js';
import { RecordLookupsCommand } from './record-lookups.command.js';

/**
 * A reported `occurredAt` older than this is treated as a clock the client got
 * wrong (a reopened laptop, a skewed device) and replaced with the receive time.
 * Dropping the lookup instead would lose the observation to keep a timestamp
 * nobody trusts anyway.
 */
const MAX_REPORT_AGE_MS = 24 * 60 * 60 * 1000;

@CommandHandler(RecordLookupsCommand)
export class RecordLookupsHandler implements ICommandHandler<RecordLookupsCommand, void> {
  private readonly logger = new Logger(RecordLookupsHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(command: RecordLookupsCommand): Promise<void> {
    const { userId, lookups } = command;
    if (lookups.length === 0) return;

    const receivedAt = this.clock.now();

    // The repository scopes by userId, so no other learner's card can be
    // reached even if the caller guesses valid vocabulary item ids.
    const cards = await this.srsRepo.findByUserAndContents(
      userId,
      'VOCABULARY_WORD',
      [...new Set(lookups.map((lookup) => lookup.vocabularyItemId))],
    );
    const stateByItemId = new Map(cards.map((card) => [card.contentId, card.state]));

    for (const lookup of lookups) {
      const payload: VocabularyLookedUpPayload = {
        userId,
        lessonId: lookup.lessonId,
        lessonVariantId: lookup.lessonVariantId,
        vocabularyItemId: lookup.vocabularyItemId,
        level: lookup.level,
        // Absent from the map means the learner has no card for the word — the
        // reader looked up something outside their SRS entirely.
        srsState: stateByItemId.get(lookup.vocabularyItemId) ?? null,
        occurredAt: this.resolveOccurredAt(lookup.occurredAt, receivedAt),
      };

      await this.publisher.publish(LEARNING_EVENT_TYPES.VOCABULARY_LOOKED_UP, payload);
    }

    this.logger.debug(`Recorded ${lookups.length} vocabulary lookup(s) for user ${userId}`);
  }

  private resolveOccurredAt(reported: string, receivedAt: Date): string {
    const parsed = new Date(reported);
    if (Number.isNaN(parsed.getTime())) return receivedAt.toISOString();

    const age = receivedAt.getTime() - parsed.getTime();
    if (age < 0 || age > MAX_REPORT_AGE_MS) return receivedAt.toISOString();

    return parsed.toISOString();
  }
}
