import { ICommand } from '@nestjs/cqrs';

export class CreateSchoolGroupCommand implements ICommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly name: string,
    public readonly description?: string | null,
  ) {}
}
