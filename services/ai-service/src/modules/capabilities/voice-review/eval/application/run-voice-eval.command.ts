/**
 * A platform_admin measures a speech model on the readings teachers ruled on before binding it
 * to `voice_review` — or, with `pronunciation`, to `voice_review_pronunciation` (plan 82, step 10).
 */
export class RunVoiceEvalCommand {
  constructor(
    readonly modelId: string,
    /** Hear with pronunciation scores, as `voice_review_pronunciation` does: Azure is then given the passage. */
    readonly pronunciation: boolean,
    /** How many of the newest decided readings to take. */
    readonly limit: number,
    readonly actorUserId: string,
  ) {}
}
