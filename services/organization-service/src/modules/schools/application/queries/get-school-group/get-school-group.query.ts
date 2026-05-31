import { IQuery } from '@nestjs/cqrs';

export class GetSchoolGroupQuery implements IQuery {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
  ) {}
}
