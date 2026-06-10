export class InvitationAlreadyAcceptedException extends Error {
  constructor(invitationId: string) {
    super(`Invitation ${invitationId} has already been accepted`);
    this.name = 'InvitationAlreadyAcceptedException';
  }
}
