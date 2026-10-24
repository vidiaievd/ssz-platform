/** The learner says a model's review of their work is wrong (plan 79, step 2.3b). */
export class DisputeAiReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly userId: string,
    /** Why, in the learner's words; null when they said nothing more. */
    readonly reason: string | null,
  ) {}
}
