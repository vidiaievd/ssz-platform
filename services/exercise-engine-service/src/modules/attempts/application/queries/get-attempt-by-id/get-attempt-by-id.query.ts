export class GetAttemptByIdQuery {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
  ) {}
}
