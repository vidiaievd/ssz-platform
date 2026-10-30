import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  DELETED_USER_ERASER,
  type ErasedLearnerData,
  type IDeletedUserEraser,
} from '../ports/deleted-user-eraser.port.js';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';

/**
 * VoxOrd plan 07, step 3d. Deletes rather than unenrols or cancels: no event goes out, because
 * every reader of learning's events (analytics, notification) hears `auth.user.deleted` itself.
 */
@CommandHandler(EraseDeletedUserCommand)
export class EraseDeletedUserHandler implements ICommandHandler<EraseDeletedUserCommand> {
  private readonly logger = new Logger(EraseDeletedUserHandler.name);

  constructor(@Inject(DELETED_USER_ERASER) private readonly eraser: IDeletedUserEraser) {}

  async execute(command: EraseDeletedUserCommand): Promise<ErasedLearnerData> {
    const erased = await this.eraser.erase(command.userId);
    this.logger.log(
      `Erased user ${command.userId}: enrollments=${erased.enrollments} assignments=${erased.assignments} ` +
        `progress=${erased.progress} srsCards=${erased.srsCards} canDo=${erased.canDo}`,
    );
    return erased;
  }
}
