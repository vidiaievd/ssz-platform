export class UpdateMemberPermissionsCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly targetUserId: string,
    public readonly capabilities: string[],
  ) {}
}
