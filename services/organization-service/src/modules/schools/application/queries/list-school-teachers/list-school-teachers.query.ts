import type { IQuery } from '@nestjs/cqrs';

export class ListSchoolTeachersQuery implements IQuery {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
  ) {}
}
