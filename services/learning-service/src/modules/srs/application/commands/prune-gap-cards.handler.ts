import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { RedisDueQueueService } from '../../infrastructure/cache/redis-due-queue.service.js';
import { PruneGapCardsCommand } from './prune-gap-cards.command.js';

/**
 * Deleted, not suspended (plan 68, decided 04.10). No client opens an `EXERCISE_GAP` card —
 * it is rated only when the exercise is played again — so a card whose piece is gone is
 * never rated again: it would sit in «due» for good and spend the learner's lexis budget.
 * A suspended one would surface in the learner's stats and could be unsuspended back into
 * that state. The ids never come back (an edit mints new ones), so nothing is lost that a
 * later card could have continued; what was proved about words and rules lives on the atom
 * cards, which this does not touch.
 */
@CommandHandler(PruneGapCardsCommand)
export class PruneGapCardsHandler implements ICommandHandler<PruneGapCardsCommand, number> {
  private readonly logger = new Logger(PruneGapCardsHandler.name);

  constructor(
    @Inject(SRS_REPOSITORY) private readonly repo: ISrsRepository,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  async execute(cmd: PruneGapCardsCommand): Promise<number> {
    const learners = await this.repo.deleteGapCardsExcept(cmd.exerciseId, cmd.itemKeys);
    for (const userId of learners) await this.dueQueue.invalidate(userId);

    if (learners.length > 0) {
      this.logger.log(
        `Exercise ${cmd.exerciseId}: dropped gap cards of deleted pieces for ${learners.length} learner(s)`,
      );
    }
    return learners.length;
  }
}
