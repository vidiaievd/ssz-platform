export class MarkNeedsReviewCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: string,
    public readonly contentId: string,
  ) {}
}
