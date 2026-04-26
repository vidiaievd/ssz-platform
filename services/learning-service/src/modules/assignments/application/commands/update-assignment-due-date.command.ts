import type { ICommand } from '@nestjs/cqrs';

export class UpdateAssignmentDueDateCommand implements ICommand {
  constructor(
    public readonly assignmentId: string,
    public readonly newDueAt: Date,
    public readonly requestingUserId: string,
  ) {}
}
