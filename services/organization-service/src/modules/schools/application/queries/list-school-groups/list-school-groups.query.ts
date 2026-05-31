import { IQuery } from '@nestjs/cqrs';

export class ListSchoolGroupsQuery implements IQuery {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
  ) {}
}
