import type { IQuery } from '@nestjs/cqrs';

export class GetEnrollmentQuery implements IQuery {
  constructor(
    public readonly enrollmentId: string,
    public readonly requestingUserId: string,
  ) {}
}
