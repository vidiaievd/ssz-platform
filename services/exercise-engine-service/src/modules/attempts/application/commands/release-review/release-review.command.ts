/** The reviewer left the screen (plan 44 §44.8). */
export class ReleaseReviewCommand {
  constructor(
    public readonly attemptId: string,
    public readonly schoolId: string,
    public readonly teacherId: string,
  ) {}
}
