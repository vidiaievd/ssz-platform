import type { ICommand } from '@nestjs/cqrs';

export class CancelAssignmentCommand implements ICommand {
  constructor(
    public readonly assignmentId: string,
    public readonly requestingUserId: string,
    public readonly requestingUserRoles: string[],
    public readonly reason?: string,
  ) {}
}
