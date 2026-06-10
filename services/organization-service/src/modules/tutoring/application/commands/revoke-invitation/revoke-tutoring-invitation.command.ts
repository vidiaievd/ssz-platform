export class RevokeTutoringInvitationCommand {
  constructor(
    readonly actorId: string,
    readonly invitationId: string,
  ) {}
}
