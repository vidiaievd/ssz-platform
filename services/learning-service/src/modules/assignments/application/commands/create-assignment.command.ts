import type { ICommand } from '@nestjs/cqrs';

export class CreateAssignmentCommand implements ICommand {
  constructor(
    public readonly assignerId: string,
    public readonly assigneeId: string,
    public readonly schoolId: string,
    public readonly contentType: string,
    public readonly contentId: string,
    public readonly dueAt: Date,
    public readonly notes?: string,
  ) {}
}
