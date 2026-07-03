import { CommandHandler, CommandBus, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CONTENT_CLIENT, type IContentClient } from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ApplyPlacementCommand } from './apply-placement.command.js';
import { BulkIntroduceFromVocabularyListCommand } from '../bulk-introduce-from-vocabulary-list.command.js';
import type { BulkIntroduceResult } from '../bulk-introduce-from-vocabulary-list.handler.js';

export interface ApplyPlacementResult {
  courseId: string;
  placedLevel: string;
  vocabListsSeeded: number;
  cardsSeeded: number;
}

@CommandHandler(ApplyPlacementCommand)
export class ApplyPlacementHandler
  implements ICommandHandler<ApplyPlacementCommand, Result<ApplyPlacementResult, Error>>
{
  private readonly logger = new Logger(ApplyPlacementHandler.name);

  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(cmd: ApplyPlacementCommand): Promise<Result<ApplyPlacementResult, Error>> {
    // Collect all leaf content refs from the course (recursively through nested modules).
    const leafResult = await this.contentClient.getContainerLeafItems(cmd.courseId);
    if (leafResult.isFail) {
      this.logger.warn(
        `ApplyPlacement: failed to fetch leaf items for course ${cmd.courseId}: ${leafResult.error.message}`,
      );
      return Result.fail(leafResult.error);
    }

    const vocabListIds = leafResult.value
      .filter((ref) => ref.type === 'VOCABULARY_LIST')
      .map((ref) => ref.id);

    if (vocabListIds.length === 0) {
      this.logger.log(
        `ApplyPlacement: no vocabulary lists in course ${cmd.courseId} for user ${cmd.userId}`,
      );
      return Result.ok({ courseId: cmd.courseId, placedLevel: cmd.placedLevel, vocabListsSeeded: 0, cardsSeeded: 0 });
    }

    let totalSeeded = 0;
    let listsSeeded = 0;

    for (const listId of vocabListIds) {
      const result = await this.commandBus.execute<
        BulkIntroduceFromVocabularyListCommand,
        Result<BulkIntroduceResult, Error>
      >(new BulkIntroduceFromVocabularyListCommand(cmd.userId, listId, 'DIAGNOSTIC_KNOWN'));

      if (result.isOk) {
        totalSeeded += result.value.introduced;
        listsSeeded += 1;
      } else {
        this.logger.warn(
          `ApplyPlacement: bulk introduce failed for list ${listId}: ${result.error.message}`,
        );
      }
    }

    this.logger.log(
      `ApplyPlacement: seeded ${totalSeeded} cards across ${listsSeeded} vocab lists ` +
      `for user ${cmd.userId} at level ${cmd.placedLevel} in course ${cmd.courseId}`,
    );

    return Result.ok({
      courseId: cmd.courseId,
      placedLevel: cmd.placedLevel,
      vocabListsSeeded: listsSeeded,
      cardsSeeded: totalSeeded,
    });
  }
}
