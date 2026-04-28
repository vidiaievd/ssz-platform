export class StartAttemptCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly language: string,
    public readonly assignmentId: string | null,
    public readonly enrollmentId: string | null,
  ) {}
}
