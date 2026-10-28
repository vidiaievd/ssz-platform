/** What the learner's own plan has spent on one agent this period (plan 83, step 6). */
export class GetMyUsageQuery {
  constructor(
    readonly userId: string,
    /** A plan key, `ai.<capability>`. */
    readonly featureKey: string,
  ) {}
}
