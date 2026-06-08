import type { ICommand } from '@nestjs/cqrs';
import type { AvailabilityWindow } from '../../dto/school.dto.js';

export class UpdateTeacherAttrsCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly userId: string,
    public readonly maxWeeklyHours?: number | null,
    public readonly availability?: AvailabilityWindow[] | null,
    public readonly employmentType?: 'full' | 'part' | 'contract' | null,
    public readonly status?: 'active' | 'invited' | 'inactive',
  ) {}
}
