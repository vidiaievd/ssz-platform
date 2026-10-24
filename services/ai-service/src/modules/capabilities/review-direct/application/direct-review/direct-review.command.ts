/** A learner's submission routed with no school behind it; review it and rule on it (plan 79, step 2.2c). */
export class DirectReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly userId: string,
    readonly templateCode: string,
  ) {}
}
