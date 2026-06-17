export class UpdateGroupMemberRoleCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly userId: string,
    public readonly role: 'student' | 'trial' | 'observer',
  ) {}
}
