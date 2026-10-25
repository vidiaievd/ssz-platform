import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { DeleteReviewBlockCommand } from './delete-review-block.command.js';
import {
  REVIEW_BLOCK_REPOSITORY,
  type IReviewBlockRepository,
} from '../../../domain/repositories/review-block.repository.interface.js';
import { ReviewBlockAccessService } from '../../services/review-block-access.js';

@CommandHandler(DeleteReviewBlockCommand)
export class DeleteReviewBlockHandler implements ICommandHandler<DeleteReviewBlockCommand, void> {
  constructor(
    @Inject(REVIEW_BLOCK_REPOSITORY) private readonly blocks: IReviewBlockRepository,
    private readonly access: ReviewBlockAccessService,
  ) {}

  async execute(cmd: DeleteReviewBlockCommand): Promise<void> {
    const block = await this.blocks.findById(cmd.blockId);
    if (!block) throw new NotFoundException(`Review block ${cmd.blockId} not found`);
    await this.access.requireCanWrite(block.schoolId, block.teacherId, cmd.user);
    await this.blocks.delete(block.id);
  }
}
