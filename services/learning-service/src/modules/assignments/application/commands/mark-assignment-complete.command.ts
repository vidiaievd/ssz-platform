import type { ICommand } from '@nestjs/cqrs';

export class MarkAssignmentCompleteCommand implements ICommand {
  constructor(
    public readonly assignmentId: string,
  ) {}
}
