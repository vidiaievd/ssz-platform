export class TutoringInvitationAlreadyAcceptedException extends Error {
  constructor(invitationId: string) {
    super(`Tutoring invitation ${invitationId} has already been accepted`);
    this.name = 'TutoringInvitationAlreadyAcceptedException';
  }
}
