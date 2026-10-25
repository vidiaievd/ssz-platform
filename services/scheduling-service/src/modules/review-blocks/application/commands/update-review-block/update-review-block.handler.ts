import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { UpdateReviewBlockCommand } from './update-review-block.command.js';
import {
  REVIEW_BLOCK_REPOSITORY,
  type IReviewBlockRepository,
} from '../../../domain/repositories/review-block.repository.interface.js';
import type { ReviewBlock } from '../../../domain/entities/review-block.entity.js';
import { ReviewBlockAccessService } from '../../services/review-block-access.js';
import { requireReviewBlockShape } from '../../services/review-block-shape.js';

/**
 * Changes the rule of a block — every sitting of a series at once, past ones included.
 * Ending a series and starting another is how a teacher keeps the past as it was; that
 * is the screen's choice to offer, not something this command guesses.
 */
@CommandHandler(UpdateReviewBlockCommand)
export class UpdateReviewBlockHandler implements ICommandHandler<UpdateReviewBlockCommand, ReviewBlock> {
  constructor(
    @Inject(REVIEW_BLOCK_REPOSITORY) private readonly blocks: IReviewBlockRepository,
    private readonly access: ReviewBlockAccessService,
  ) {}

  async execute(cmd: UpdateReviewBlockCommand): Promise<ReviewBlock> {
    const block = await this.blocks.findById(cmd.blockId);
    if (!block) throw new NotFoundException(`Review block ${cmd.blockId} not found`);
    await this.access.requireCanWrite(block.schoolId, block.teacherId, cmd.user);

    const repeat = cmd.changes.repeat ?? block.repeat;
    const startsOn = cmd.changes.startsOn ?? block.startsOn;
    // A one-off follows its day wherever it moves; a series keeps the end it was given.
    const endsOn =
      repeat === 'one_off'
        ? startsOn
        : cmd.changes.endsOn !== undefined
          ? cmd.changes.endsOn
          : block.repeat === 'one_off'
            ? null
            : block.endsOn;
    const shape = {
      repeat,
      startsOn,
      endsOn,
      startTime: cmd.changes.startTime ?? block.startTime,
      endTime: cmd.changes.endTime ?? block.endTime,
    };
    requireReviewBlockShape(shape);

    return this.blocks.update(block.id, {
      ...shape,
      ...(cmd.changes.note !== undefined ? { note: cmd.changes.note } : {}),
    });
  }
}
