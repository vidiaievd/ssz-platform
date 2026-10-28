/** A learner's mark on one answer (plan 83, §3 `feedback`): who, from the JWT, and on which call. */
export class GiveAssistFeedbackCommand {
  constructor(
    readonly userId: string,
    readonly callId: string,
    readonly helpful: boolean,
    readonly reason: string | null,
  ) {}
}
