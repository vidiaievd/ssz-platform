export class RevokeSchoolInvitationCommand {
  constructor(
    readonly actorId: string,
    readonly schoolId: string,
    readonly invitationId: string,
  ) {}
}
