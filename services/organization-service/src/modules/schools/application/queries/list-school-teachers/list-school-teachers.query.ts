import type { IQuery } from '@nestjs/cqrs';

export class ListSchoolTeachersQuery implements IQuery {
  constructor(
    /** Null for a service asking over the internal API: there is no person to check. */
    public readonly actorId: string | null,
    public readonly schoolId: string,
  ) {}
}
