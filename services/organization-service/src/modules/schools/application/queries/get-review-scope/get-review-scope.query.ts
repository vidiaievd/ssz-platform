export class GetReviewScopeQuery {
  constructor(
    public readonly schoolId: string,
    public readonly teacherId: string,
    public readonly at: Date,
  ) {}
}
