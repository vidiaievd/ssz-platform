import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  USER_DATA_ERASER,
  type ErasedUserData,
  type IUserDataEraser,
} from '../../ports/user-data-eraser.interface.js';
import { EraseUserDataCommand } from './erase-user-data.command.js';

/**
 * VoxOrd plan 07, step 3c. Deletes rather than soft-deletes: a `deletedAt` row would keep the
 * name, birth date and placement history of someone who asked for them to be gone.
 */
@CommandHandler(EraseUserDataCommand)
export class EraseUserDataHandler implements ICommandHandler<EraseUserDataCommand> {
  private readonly logger = new Logger(EraseUserDataHandler.name);

  constructor(
    @Inject(USER_DATA_ERASER)
    private readonly eraser: IUserDataEraser,
  ) {}

  async execute(command: EraseUserDataCommand): Promise<ErasedUserData> {
    const erased = await this.eraser.erase(command.userId);
    this.logger.log(
      `Erased user ${command.userId}: profiles=${erased.profiles} placement=${erased.placementResults} emailIndex=${erased.emailIndex}`,
    );
    return erased;
  }
}
