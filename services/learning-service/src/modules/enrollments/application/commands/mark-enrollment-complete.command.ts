import type { ICommand } from '@nestjs/cqrs';

export class MarkEnrollmentCompleteCommand implements ICommand {
  constructor(
    public readonly enrollmentId: string,
    public readonly requestingUserId: string,
  ) {}
}
