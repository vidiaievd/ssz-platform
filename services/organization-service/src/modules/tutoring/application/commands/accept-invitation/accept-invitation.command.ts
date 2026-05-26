export class AcceptTutoringInvitationCommand {
  constructor(
    public readonly actorId: string,
    public readonly actorEmail: string,
    public readonly token: string,
  ) {}
}
