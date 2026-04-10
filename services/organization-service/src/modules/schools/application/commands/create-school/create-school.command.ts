export class CreateSchoolCommand {
  constructor(
    public readonly actorId: string,
    public readonly name: string,
    public readonly description?: string,
    public readonly avatarUrl?: string,
  ) {}
}
