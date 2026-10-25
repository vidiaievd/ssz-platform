/**
 * Sets this course's part of the review policy, whole: its auto-accept term (`null`
 * inherits the school's) and the templates that always go to a teacher.
 */
export class SetContainerReviewAiPolicyCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly autoAcceptAfterHours: number | null,
    public readonly teacherReviewTemplates: string[],
  ) {}
}
