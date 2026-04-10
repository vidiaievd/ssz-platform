export class AcceptInvitationCommand {
  constructor(
    public readonly actorId: string,
    public readonly token: string,
  ) {}
}
