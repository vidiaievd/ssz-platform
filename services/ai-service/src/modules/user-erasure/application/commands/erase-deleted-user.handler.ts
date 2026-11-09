import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  DELETED_USER_ERASER,
  type ErasedLearnerData,
  type IDeletedUserEraser,
} from '../ports/deleted-user-eraser.port.js';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';

/**
 * VoxOrd plan 07, step 3e. The ledger is the one money record here, so it is unlinked rather
 * than deleted; a self-paying learner's rows keep the payer id, as subscription-service keeps
 * their account. Nothing is published: analytics hears `auth.user.deleted` itself.
 */
@CommandHandler(EraseDeletedUserCommand)
export class EraseDeletedUserHandler implements ICommandHandler<EraseDeletedUserCommand, ErasedLearnerData> {
  private readonly logger = new Logger(EraseDeletedUserHandler.name);

  constructor(@Inject(DELETED_USER_ERASER) private readonly eraser: IDeletedUserEraser) {}

  async execute(command: EraseDeletedUserCommand): Promise<ErasedLearnerData> {
    const erased = await this.eraser.erase(command.userId);
    this.logger.log(
      `Erased user ${command.userId}: callsUnlinked=${erased.callsUnlinked} feedback=${erased.feedback} ` +
        `payerRows=${erased.payerRows}`,
    );
    return erased;
  }
}
