import { ICommand } from '@nestjs/cqrs';

export class UpdateSchoolGroupCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly name?: string,
    public readonly description?: string | null,
  ) {}
}
