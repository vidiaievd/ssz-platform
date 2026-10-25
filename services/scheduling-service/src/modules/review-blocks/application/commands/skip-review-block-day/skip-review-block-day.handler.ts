import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SkipReviewBlockDayCommand } from './skip-review-block-day.command.js';
import {
  REVIEW_BLOCK_REPOSITORY,
  type IReviewBlockRepository,
} from '../../../domain/repositories/review-block.repository.interface.js';
import { dayKey } from '../../../domain/entities/review-block.entity.js';
import { ReviewBlockAccessService } from '../../services/review-block-access.js';

/** Takes one sitting out of a series — "not this Tuesday" — and leaves the rule alone. */
@CommandHandler(SkipReviewBlockDayCommand)
export class SkipReviewBlockDayHandler implements ICommandHandler<SkipReviewBlockDayCommand, void> {
  constructor(
    @Inject(REVIEW_BLOCK_REPOSITORY) private readonly blocks: IReviewBlockRepository,
    private readonly access: ReviewBlockAccessService,
  ) {}

  async execute(cmd: SkipReviewBlockDayCommand): Promise<void> {
    const block = await this.blocks.findById(cmd.blockId);
    if (!block) throw new NotFoundException(`Review block ${cmd.blockId} not found`);
    await this.access.requireCanWrite(block.schoolId, block.teacherId, cmd.user);

    // A one-off with its only day skipped would be a block nobody can see or remove
    // from a calendar: delete it instead.
    if (block.repeat === 'one_off') {
      throw new UnprocessableEntityException({
        code: 'ONE_OFF_CANNOT_SKIP',
        message: 'A one-off block is deleted, not skipped',
      });
    }
    if (block.skips.has(dayKey(cmd.date))) return;
    if (block.occurrencesBetween(cmd.date, cmd.date).length === 0) {
      throw new UnprocessableEntityException({
        code: 'NOT_AN_OCCURRENCE',
        message: 'The series does not sit on that day',
      });
    }
    await this.blocks.addSkip(block.id, cmd.date);
  }
}
