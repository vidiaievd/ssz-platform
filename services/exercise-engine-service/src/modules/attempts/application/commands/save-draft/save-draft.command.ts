export class SaveDraftCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** The work so far, in the template's own shape. Stored as it arrives. */
    public readonly draftAnswer: unknown,
  ) {}
}
