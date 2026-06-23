import type { ICommand } from '@nestjs/cqrs';

export class RemoveGroupMaterialCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly materialId: string,
  ) {}
}
