/**
 * The shape of a school's review load, for the oversight screen.
 *
 * `periodDays` bounds only the verdicts already delivered. What is still waiting is not
 * bounded by it: a submission from two months ago that nobody has answered is exactly
 * what an administrator opened this screen to find, and a period filter would hide it.
 */
export class AggregateReviewLoadQuery {
  constructor(
    public readonly schoolId: string,
    public readonly periodDays: number,
  ) {}
}
