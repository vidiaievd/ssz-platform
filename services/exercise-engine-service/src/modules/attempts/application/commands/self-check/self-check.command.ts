export class SelfCheckCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The edits made so far, in the same shape a submission carries them. */
    public readonly draftAnswer: unknown,
  ) {}
}
