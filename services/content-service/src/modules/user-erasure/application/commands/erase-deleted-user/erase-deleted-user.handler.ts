import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  DELETED_USER_ERASER,
  type ErasedUserContent,
  type IDeletedUserEraser,
} from '../../ports/deleted-user-eraser.port.js';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';

/**
 * VoxOrd plan 07, step 3d. Deletes rather than revokes: a revoked entitlement or a captured
 * word with its context sentence still says what this person studied and read.
 */
@CommandHandler(EraseDeletedUserCommand)
export class EraseDeletedUserHandler implements ICommandHandler<EraseDeletedUserCommand> {
  private readonly logger = new Logger(EraseDeletedUserHandler.name);

  constructor(@Inject(DELETED_USER_ERASER) private readonly eraser: IDeletedUserEraser) {}

  async execute(command: EraseDeletedUserCommand): Promise<ErasedUserContent> {
    const erased = await this.eraser.erase(command.userId);
    this.logger.log(
      `Erased user ${command.userId}: words=${erased.words} personalLists=${erased.personalLists} ` +
        `entitlements=${erased.entitlements} sharesReceived=${erased.sharesReceived}`,
    );
    if (erased.authoredLeft > 0) {
      this.logger.warn(
        `Deleted user ${command.userId} still owns ${erased.authoredLeft} authored item(s) — left for support`,
      );
    }
    return erased;
  }
}
