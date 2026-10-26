/**
 * A learner's reading aloud a speech model hears first (plan 82, step 8): routed with no school
 * behind it, or at a school that has a model answer first (plan 80) — `schoolId` from the event,
 * which the engine's row confirms.
 */
export class VoiceReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly userId: string,
    readonly templateCode: string,
    readonly schoolId: string | null = null,
  ) {}
}
