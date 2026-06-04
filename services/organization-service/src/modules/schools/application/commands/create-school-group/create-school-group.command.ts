import type { ICommand } from '@nestjs/cqrs';
import type { GroupMode } from '../../../domain/entities/school-group.entity.js';

export class CreateSchoolGroupCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly name: string,
    public readonly description?: string | null,
    public readonly mode?: GroupMode,
    public readonly courseId?: string | null,
    public readonly lang?: string | null,
    public readonly level?: string | null,
    public readonly capacityMin?: number | null,
    public readonly capacityMax?: number | null,
    public readonly startDate?: Date | null,
    public readonly endDate?: Date | null,
  ) {}
}
