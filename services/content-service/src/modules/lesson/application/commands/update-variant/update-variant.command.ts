export class UpdateVariantCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly displayTitle?: string,
    public readonly displayDescription?: string | null,
    public readonly bodyMarkdown?: string,
    public readonly estimatedReadingMinutes?: number | null,
  ) {}
}
