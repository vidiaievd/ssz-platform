export class ListPendingReviewsQuery {
  constructor(
    public readonly schoolId: string,
    public readonly limit?: number,
    public readonly offset?: number,
  ) {}
}
