export class CheckAttemptCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The work so far, in the same shape a submission carries it. */
    public readonly draftAnswer: unknown,
  ) {}
}
