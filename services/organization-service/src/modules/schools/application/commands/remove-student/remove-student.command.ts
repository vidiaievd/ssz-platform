export class RemoveStudentCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly studentUserId: string,
  ) {}
}
