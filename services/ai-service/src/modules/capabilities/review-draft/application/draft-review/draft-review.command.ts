/** A submission went to a teacher's queue; draft its review if it qualifies (plan 79, step 1.3). */
export class DraftReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly userId: string,
    readonly templateCode: string,
    readonly schoolId: string | null,
  ) {}
}
