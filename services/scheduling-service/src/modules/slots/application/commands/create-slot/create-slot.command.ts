import type { WeekDay } from '../../../domain/entities/slot.entity.js';

export class CreateSlotCommand {
  constructor(
    public readonly groupId: string,
    public readonly schoolId: string,
    public readonly weekday: WeekDay,
    public readonly startTime: string,
    public readonly endTime: string,
    public readonly room: string | null,
  ) {}
}
