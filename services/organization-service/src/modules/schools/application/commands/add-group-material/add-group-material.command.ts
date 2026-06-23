import type { ICommand } from '@nestjs/cqrs';

export class AddGroupMaterialCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly courseId: string,
  ) {}
}
