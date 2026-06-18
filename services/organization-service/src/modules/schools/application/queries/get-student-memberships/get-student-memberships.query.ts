export class GetStudentMembershipsQuery {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly studentUserId: string,
  ) {}
}
