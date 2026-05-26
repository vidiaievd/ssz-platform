export class SendTutoringInvitationCommand {
  constructor(
    public readonly actorId: string,
    public readonly email: string,
  ) {}
}
