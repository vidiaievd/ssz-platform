import type { ICommand } from '@nestjs/cqrs';

export class PublishSchoolGroupCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
  ) {}
}
