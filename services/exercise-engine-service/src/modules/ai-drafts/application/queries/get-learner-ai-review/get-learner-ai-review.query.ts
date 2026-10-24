/** A model's review of a learner's own work, as that learner reads it (plan 79, step 2.3). */
export class GetLearnerAiReviewQuery {
  constructor(
    readonly attemptId: string,
    readonly userId: string,
  ) {}
}
