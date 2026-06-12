export class InvitationRevokedException extends Error {
  constructor(id: string) {
    super(`Invitation ${id} has been revoked`);
    this.name = 'InvitationRevokedException';
  }
}
