/** Minutes per submission a school expects — read by its settings screen and by exercise-engine. */
export class GetReviewEffortMinutesQuery {
  constructor(public readonly schoolId: string) {}
}
