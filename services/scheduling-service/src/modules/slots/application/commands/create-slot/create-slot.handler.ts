import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateSlotCommand } from './create-slot.command.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import type { Slot } from '../../../domain/entities/slot.entity.js';

@CommandHandler(CreateSlotCommand)
export class CreateSlotHandler implements ICommandHandler<CreateSlotCommand, Slot> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
  ) {}

  execute(cmd: CreateSlotCommand): Promise<Slot> {
    return this.slots.create({
      groupId: cmd.groupId,
      schoolId: cmd.schoolId,
      weekday: cmd.weekday,
      startTime: cmd.startTime,
      endTime: cmd.endTime,
      room: cmd.room,
    });
  }
}
