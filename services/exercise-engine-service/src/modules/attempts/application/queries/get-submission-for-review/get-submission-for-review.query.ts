/**
 * One submission, as its reviewer needs to see it (plan 44 §44.7).
 *
 * `schoolId` is carried for the same reason the queue carries it (§0.2): the engine does
 * no authorising, so the caller has to say on whose behalf it is asking, and a submission
 * belonging to another school is then simply not found.
 */
export class GetSubmissionForReviewQuery {
  constructor(
    public readonly attemptId: string,
    public readonly schoolId: string,
  ) {}
}
