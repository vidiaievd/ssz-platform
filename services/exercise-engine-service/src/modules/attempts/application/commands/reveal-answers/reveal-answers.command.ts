export class RevealAnswersCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
  ) {}
}
