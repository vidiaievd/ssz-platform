export class InvitationExpiredException extends Error {
  constructor(id: string) {
    super(`Invitation ${id} has expired`);
    this.name = 'InvitationExpiredException';
  }
}
