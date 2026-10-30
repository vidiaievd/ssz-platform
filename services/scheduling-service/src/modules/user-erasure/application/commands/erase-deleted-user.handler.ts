import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  DELETED_USER_ERASER,
  type ErasedLearnerData,
  type IDeletedUserEraser,
} from '../ports/deleted-user-eraser.port.js';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';

/**
 * VoxOrd plan 07, step 3e. No event goes out: a lesson's attendance count and its log stay as
 * the teacher wrote them, and a score dropping out only changes the exam's average.
 */
@CommandHandler(EraseDeletedUserCommand)
export class EraseDeletedUserHandler implements ICommandHandler<EraseDeletedUserCommand> {
  private readonly logger = new Logger(EraseDeletedUserHandler.name);

  constructor(@Inject(DELETED_USER_ERASER) private readonly eraser: IDeletedUserEraser) {}

  async execute(command: EraseDeletedUserCommand): Promise<ErasedLearnerData> {
    const erased = await this.eraser.erase(command.userId);
    this.logger.log(
      `Erased user ${command.userId}: lessonScores=${erased.lessonScores} memberships=${erased.memberships}`,
    );
    return erased;
  }
}
