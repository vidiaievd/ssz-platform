/**
 * A platform_admin measures a candidate model on the teachers' settled drafts before
 * binding it to `review_draft` (plan 79, step 1.6).
 */
export class RunReviewEvalCommand {
  constructor(
    readonly modelId: string,
    /** Null = the binding's prompt version. */
    readonly promptVersion: string | null,
    /** How many of the newest settled drafts to take. */
    readonly limit: number,
    readonly actorUserId: string,
  ) {}
}
