export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export class Slot {
  constructor(
    public readonly id: string,
    public readonly groupId: string,
    public readonly schoolId: string,
    public readonly weekday: WeekDay,
    public readonly startTime: string,
    public readonly endTime: string,
    public readonly room: string | null,
    public readonly createdAt: Date,
  ) {}
}
