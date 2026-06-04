import type { ICommand } from '@nestjs/cqrs';
import type { GroupTeacherRole } from '../../../domain/entities/school-group.entity.js';

export class RemoveGroupTeacherCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly userId: string,
    public readonly role: GroupTeacherRole,
  ) {}
}
