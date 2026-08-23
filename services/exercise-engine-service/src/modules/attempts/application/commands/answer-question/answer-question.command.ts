export class AnswerQuestionCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** Which question of the set is being handed in. */
    public readonly questionId: string,
    /** What the student wrote. */
    public readonly text: string,
  ) {}
}
