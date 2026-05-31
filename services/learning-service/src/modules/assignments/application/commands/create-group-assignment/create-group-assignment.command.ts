import { ICommand } from '@nestjs/cqrs';

export class CreateGroupAssignmentCommand implements ICommand {
  constructor(
    public readonly assignerId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly contentType: string,
    public readonly contentId: string,
    public readonly dueAt: Date,
    public readonly notes?: string,
  ) {}
}
