export class InvitationNotFoundException extends Error {
  constructor(token: string) {
    super(`Invitation not found: ${token}`);
    this.name = 'InvitationNotFoundException';
  }
}
