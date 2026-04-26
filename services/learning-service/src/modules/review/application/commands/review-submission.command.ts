export class ReviewSubmissionCommand {
  constructor(
    public readonly submissionId: string,
    public readonly reviewerId: string,
    public readonly reviewerRoles: string[],
    public readonly decision: string,
    public readonly feedback?: string,
    public readonly score?: number,
  ) {}
}
