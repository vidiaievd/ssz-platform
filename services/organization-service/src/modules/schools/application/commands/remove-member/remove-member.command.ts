export class RemoveMemberCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly userId: string,
  ) {}
}
