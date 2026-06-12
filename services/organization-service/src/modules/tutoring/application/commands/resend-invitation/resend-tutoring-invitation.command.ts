export class ResendTutoringInvitationCommand {
  constructor(
    readonly actorId: string,
    readonly invitationId: string,
  ) {}
}
