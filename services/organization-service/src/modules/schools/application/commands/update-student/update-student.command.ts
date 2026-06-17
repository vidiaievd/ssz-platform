export class UpdateStudentCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly studentUserId: string,
    public readonly status?: 'active' | 'archived',
    public readonly level?: string,
  ) {}
}
