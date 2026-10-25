import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateReviewBlockCommand } from './create-review-block.command.js';
import {
  REVIEW_BLOCK_REPOSITORY,
  type IReviewBlockRepository,
} from '../../../domain/repositories/review-block.repository.interface.js';
import type { ReviewBlock } from '../../../domain/entities/review-block.entity.js';
import { ReviewBlockAccessService } from '../../services/review-block-access.js';
import { requireReviewBlockShape } from '../../services/review-block-shape.js';

@CommandHandler(CreateReviewBlockCommand)
export class CreateReviewBlockHandler implements ICommandHandler<CreateReviewBlockCommand, ReviewBlock> {
  constructor(
    @Inject(REVIEW_BLOCK_REPOSITORY) private readonly blocks: IReviewBlockRepository,
    private readonly access: ReviewBlockAccessService,
  ) {}

  async execute(cmd: CreateReviewBlockCommand): Promise<ReviewBlock> {
    const shape = {
      repeat: cmd.repeat,
      startsOn: cmd.startsOn,
      endsOn: cmd.repeat === 'one_off' ? (cmd.endsOn ?? cmd.startsOn) : cmd.endsOn,
      startTime: cmd.startTime,
      endTime: cmd.endTime,
    };
    // Shape first: a malformed block is the caller's mistake whoever they are, and
    // saying so costs no call to organization-service.
    requireReviewBlockShape(shape);
    await this.access.requireCanWrite(cmd.schoolId, cmd.teacherId, cmd.user);

    return this.blocks.create({
      ...shape,
      schoolId: cmd.schoolId,
      teacherId: cmd.teacherId,
      note: cmd.note,
      createdBy: cmd.user.userId,
    });
  }
}
