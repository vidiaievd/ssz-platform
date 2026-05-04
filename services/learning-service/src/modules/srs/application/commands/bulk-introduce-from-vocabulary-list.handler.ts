import { CommandHandler, CommandBus, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CONTENT_CLIENT, type IContentClient } from '../../../../shared/application/ports/content-client.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import { BulkIntroduceFromVocabularyListCommand } from './bulk-introduce-from-vocabulary-list.command.js';
import { IntroduceCardCommand } from './introduce-card.command.js';

export interface BulkIntroduceResult {
  introduced: number;
  skipped: number;
}

@CommandHandler(BulkIntroduceFromVocabularyListCommand)
export class BulkIntroduceFromVocabularyListHandler
  implements ICommandHandler<BulkIntroduceFromVocabularyListCommand, Result<BulkIntroduceResult, Error>>
{
  private readonly logger = new Logger(BulkIntroduceFromVocabularyListHandler.name);

  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(
    cmd: BulkIntroduceFromVocabularyListCommand,
  ): Promise<Result<BulkIntroduceResult, Error>> {
    // Fetch all vocabulary item IDs from the list via Content Service.
    const itemsResult = await this.contentClient.getVocabularyListItems(cmd.vocabularyListId);
    if (itemsResult.isFail) {
      this.logger.warn(
        `BulkIntroduce: failed to fetch vocabulary list ${cmd.vocabularyListId}: ${itemsResult.error.message}`,
      );
      return Result.fail(itemsResult.error);
    }

    const items = itemsResult.value;
    let introduced = 0;
    let skipped = 0;

    for (const itemId of items) {
      const result = await this.commandBus.execute<IntroduceCardCommand, Result<any, any>>(
        new IntroduceCardCommand(cmd.userId, 'VOCABULARY_WORD', itemId),
      );
      if (result.isOk) {
        introduced += 1;
      } else {
        // SrsNewCardLimitError or already-exists — count as skipped.
        skipped += 1;
        // Stop early on limit-hit to avoid hammering subsequent introduces.
        if (result.error?.constructor?.name === 'SrsNewCardLimitError') {
          this.logger.log(
            `BulkIntroduce: daily limit hit after introducing ${introduced} cards for user ${cmd.userId}`,
          );
          break;
        }
      }
    }

    this.logger.log(
      `BulkIntroduce vocabulary list ${cmd.vocabularyListId} for user ${cmd.userId}: ` +
      `introduced=${introduced}, skipped=${skipped}`,
    );

    return Result.ok({ introduced, skipped });
  }
}
