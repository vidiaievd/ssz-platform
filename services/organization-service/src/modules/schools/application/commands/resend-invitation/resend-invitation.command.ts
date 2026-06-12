export class ResendSchoolInvitationCommand {
  constructor(
    readonly actorId: string,
    readonly schoolId: string,
    readonly invitationId: string,
  ) {}
}
