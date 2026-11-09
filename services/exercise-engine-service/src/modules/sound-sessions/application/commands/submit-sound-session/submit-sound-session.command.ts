export class SubmitSoundSessionCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    public readonly locale: string,
  ) {}
}
