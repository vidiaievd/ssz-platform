import type { ICommand } from '@nestjs/cqrs';
import type { GroupTeacherRole } from '../../../domain/entities/school-group.entity.js';

export class AssignGroupTeacherCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly userId: string,
    public readonly role: GroupTeacherRole,
    public readonly fromDate?: Date | null,
    public readonly toDate?: Date | null,
    public readonly reason?: string | null,
    public readonly override?: boolean,
  ) {}
}
