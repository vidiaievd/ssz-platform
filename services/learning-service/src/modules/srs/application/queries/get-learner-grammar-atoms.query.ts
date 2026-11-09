export class GetLearnerGrammarAtomsQuery {
  constructor(
    public readonly userId: string,
    /** Null asks only for the queue: without a course there is nothing to have reached. */
    public readonly courseId: string | null,
  ) {}
}
