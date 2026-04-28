export class AbandonAttemptCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
  ) {}
}
