export class RemoveStudentCommand {
  constructor(
    public readonly actorId: string,
    public readonly userId: string,
  ) {}
}
