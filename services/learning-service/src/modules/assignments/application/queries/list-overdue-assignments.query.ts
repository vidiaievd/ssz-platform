import type { IQuery } from '@nestjs/cqrs';

export class ListOverdueAssignmentsQuery implements IQuery {
  constructor(
    public readonly tutorId: string,
  ) {}
}
