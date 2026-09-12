export class GetLearnerReviewContextQuery {
  constructor(
    public readonly userId: string,
    // The course the caller is resolving for — breaks ties when a student sits in
    // more than one active group (plan 44 §44.2).
    public readonly courseId?: string,
    // Where the content the learner is working on lives, when it lives anywhere.
    // A hint for the tie-break only: it never decides the answer on its own
    // (plan 59 §3, phase 3.2).
    public readonly preferredSchoolId?: string,
    // Who authored the content. A personal course names no school, so the author is
    // what tells a learner's tutor group from their school group (plan 59 §3).
    public readonly preferredTeacherId?: string,
  ) {}
}
