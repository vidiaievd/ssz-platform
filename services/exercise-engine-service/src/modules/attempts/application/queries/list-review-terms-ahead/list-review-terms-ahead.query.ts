/**
 * School work a model's verdict will close by itself within the next `withinHours`
 * (plan 80, step 5) — what a teacher should hear about before the term, not after it.
 */
export class ListReviewTermsAheadQuery {
  constructor(
    readonly schoolId: string,
    readonly withinHours: number,
  ) {}
}
