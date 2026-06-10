export class InvitationAlreadyPendingException extends Error {
  constructor(email: string) {
    super(`A pending invitation for ${email} already exists for this role`);
    this.name = 'InvitationAlreadyPendingException';
  }
}
