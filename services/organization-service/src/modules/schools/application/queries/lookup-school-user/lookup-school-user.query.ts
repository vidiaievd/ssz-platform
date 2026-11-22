export class LookupSchoolUserQuery {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
    public readonly email: string,
  ) {}
}
