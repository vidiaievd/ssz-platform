export class ListTeacherReviewBlocksQuery {
  constructor(
    public readonly teacherId: string,
    public readonly from: Date,
    public readonly to: Date,
  ) {}
}
