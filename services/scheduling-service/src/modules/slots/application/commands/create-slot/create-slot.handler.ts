import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { CreateSlotCommand } from './create-slot.command.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import type { Slot } from '../../../domain/entities/slot.entity.js';
import { OrgServiceHttpClient } from '../../../../../infrastructure/org/org-service.http-client.js';

@CommandHandler(CreateSlotCommand)
export class CreateSlotHandler implements ICommandHandler<CreateSlotCommand, Slot> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
    private readonly orgClient: OrgServiceHttpClient,
  ) {}

  async execute(cmd: CreateSlotCommand): Promise<Slot> {
    const group = await this.orgClient.getGroup(cmd.schoolId, cmd.groupId);
    if (!group) throw new NotFoundException(`Group ${cmd.groupId} not found in school ${cmd.schoolId}`);
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
