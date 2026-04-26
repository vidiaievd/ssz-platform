import type { ICommand } from '@nestjs/cqrs';

export class EnrollInContainerCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly schoolId?: string | null,
  ) {}
}
