export class SubmitAnswerCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    public readonly submittedAnswer: unknown,
    public readonly timeSpentSeconds: number,
    public readonly locale: string,
  ) {}
}
