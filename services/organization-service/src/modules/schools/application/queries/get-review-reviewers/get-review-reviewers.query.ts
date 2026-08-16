export class GetReviewReviewersQuery {
  constructor(
    public readonly groupIds: string[],
    // Point in time a submission was made — a substitution's fromDate/toDate
    // window is evaluated against it, not against "now" (plan 44 §0.2 / §44.2,
    // DATA_MODEL.md §3).
    public readonly at: Date,
  ) {}
}
