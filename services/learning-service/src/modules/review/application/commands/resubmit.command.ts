export class ResubmitCommand {
  constructor(
    public readonly submissionId: string,
    public readonly userId: string,
    public readonly content: { text?: string; mediaRefs?: string[] },
  ) {}
}
