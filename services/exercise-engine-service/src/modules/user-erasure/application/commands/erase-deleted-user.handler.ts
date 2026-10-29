import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  DELETED_USER_ERASER,
  type ErasedLearnerAttempts,
  type IDeletedUserEraser,
} from '../ports/deleted-user-eraser.port.js';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';

/**
 * VoxOrd plan 07, step 3d. Deletes rather than anonymises: an essay or a transcript names
 * its writer without any user id. A work waiting in a review queue leaves it with the row.
 */
@CommandHandler(EraseDeletedUserCommand)
export class EraseDeletedUserHandler implements ICommandHandler<EraseDeletedUserCommand> {
  private readonly logger = new Logger(EraseDeletedUserHandler.name);

  constructor(@Inject(DELETED_USER_ERASER) private readonly eraser: IDeletedUserEraser) {}

  async execute(command: EraseDeletedUserCommand): Promise<ErasedLearnerAttempts> {
    const erased = await this.eraser.erase(command.userId);
    this.logger.log(`Erased user ${command.userId}: attempts=${erased.attempts} probes=${erased.probes}`);
    return erased;
  }
}
