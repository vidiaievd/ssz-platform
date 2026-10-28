export class GetStudentStandingQuery {
  constructor(
    public readonly schoolId: string,
    public readonly userId: string,
  ) {}
}
