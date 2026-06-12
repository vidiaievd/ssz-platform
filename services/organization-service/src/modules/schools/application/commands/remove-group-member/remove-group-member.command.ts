import { ICommand } from '@nestjs/cqrs';

export class RemoveGroupMemberCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly userId: string,
  ) {}
}
