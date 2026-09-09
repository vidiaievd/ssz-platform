/**
 * A reviewer opening a submission says so (plan 44 §44.8).
 *
 * `schoolId` travels with it for the reason every review route carries one (§0.2): the
 * engine authorises nothing, so the caller names the school it is acting for.
 */
export class ClaimReviewCommand {
  constructor(
    public readonly attemptId: string,
    public readonly schoolId: string,
    public readonly teacherId: string,
  ) {}
}
