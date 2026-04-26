export class ResolveReviewCommand {
  constructor(
    public readonly userId: string,
    public readonly contentType: string,
    public readonly contentId: string,
    public readonly approved: boolean,
  ) {}
}
