export class GetStudentReviewGroupQuery {
  constructor(
    public readonly schoolId: string,
    public readonly userId: string,
    // The course the caller is resolving a group for — breaks ties when a
    // student sits in more than one active group (plan 44 §44.2).
    public readonly courseId?: string,
  ) {}
}
