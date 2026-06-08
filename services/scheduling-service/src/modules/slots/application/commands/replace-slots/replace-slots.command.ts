import type { WeekDay } from '../../../domain/entities/slot.entity.js';

export interface SlotInput {
  weekday: WeekDay;
  startTime: string;
  endTime: string;
  room?: string | null;
}

export class ReplaceSlotsCommand {
  constructor(
    public readonly groupId: string,
    public readonly schoolId: string,
    public readonly slots: SlotInput[],
  ) {}
}
