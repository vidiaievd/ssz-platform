/**
 * A learner's submission a model rules on first: routed with no school behind it (plan 79,
 * step 2.2c), or at a school that has a model answer first (plan 80, step 3c) — `schoolId`
 * from the event, which the engine's row confirms.
 */
export class DirectReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly userId: string,
    readonly templateCode: string,
    readonly schoolId: string | null = null,
  ) {}
}
