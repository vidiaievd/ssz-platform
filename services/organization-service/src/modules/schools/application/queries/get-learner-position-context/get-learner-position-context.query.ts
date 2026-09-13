export class GetLearnerPositionContextQuery {
  constructor(
    public readonly userId: string,
    /** Narrows the choice of group when the learner sits in more than one. */
    public readonly courseId?: string,
  ) {}
}
