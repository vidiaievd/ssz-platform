import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { DeleteSlotCommand } from './delete-slot.command.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';

@CommandHandler(DeleteSlotCommand)
export class DeleteSlotHandler implements ICommandHandler<DeleteSlotCommand, void> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
  ) {}

  async execute(cmd: DeleteSlotCommand): Promise<void> {
    const slot = await this.slots.findById(cmd.slotId);
    if (!slot || slot.groupId !== cmd.groupId || slot.schoolId !== cmd.schoolId) {
      throw new NotFoundException(`Slot ${cmd.slotId} not found`);
    }
    await this.slots.deleteById(cmd.slotId);
  }
}
