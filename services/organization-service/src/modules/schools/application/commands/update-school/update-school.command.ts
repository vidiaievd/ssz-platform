export class UpdateSchoolCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly name?: string,
    public readonly description?: string,
    public readonly avatarUrl?: string,
  ) {}
}
