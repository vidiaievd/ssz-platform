/** Why ai-service could not review a learner's work; kept in the log, not on the attempt. */
export const GIVE_UP_REASONS = ['refused', 'unaskable', 'failed'] as const;
export type GiveUpReason = (typeof GIVE_UP_REASONS)[number];

export class GiveUpAiReviewCommand {
  constructor(
    readonly attemptId: string,
    readonly reason: GiveUpReason,
    /** The ledger row behind the decision, when a call was made; for the log. */
    readonly aiCallId: string | null,
  ) {}
}
