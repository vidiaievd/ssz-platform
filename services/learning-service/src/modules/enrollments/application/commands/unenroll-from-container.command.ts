import type { ICommand } from '@nestjs/cqrs';

export class UnenrollFromContainerCommand implements ICommand {
  constructor(
    public readonly enrollmentId: string,
    public readonly requestingUserId: string,
    public readonly reason?: string,
  ) {}
}
