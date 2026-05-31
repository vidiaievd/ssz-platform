import { ICommand } from '@nestjs/cqrs';

export class DeleteSchoolGroupCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
  ) {}
}
