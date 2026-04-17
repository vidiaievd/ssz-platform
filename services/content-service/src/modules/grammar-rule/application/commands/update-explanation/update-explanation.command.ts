export class UpdateExplanationCommand {
  constructor(
    public readonly userId: string,
    public readonly ruleId: string,
    public readonly explanationId: string,
    public readonly displayTitle?: string,
    public readonly displaySummary?: string | null,
    public readonly bodyMarkdown?: string,
    public readonly estimatedReadingMinutes?: number | null,
  ) {}
}
