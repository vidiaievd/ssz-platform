import type { ICommand } from '@nestjs/cqrs';
import type { AvailabilityWindow } from '../../queries/list-school-teachers/list-school-teachers.handler.js';

export class UpdateTeacherAttrsCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly userId: string,
    public readonly maxWeeklyHours?: number | null,
    public readonly availability?: AvailabilityWindow[] | null,
  ) {}
}
