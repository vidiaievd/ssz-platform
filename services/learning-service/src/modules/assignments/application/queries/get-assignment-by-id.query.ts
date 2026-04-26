import type { IQuery } from '@nestjs/cqrs';

export class GetAssignmentByIdQuery implements IQuery {
  constructor(
    public readonly id: string,
    public readonly requestingUserId: string,
    public readonly requestingUserRoles: string[],
  ) {}
}
