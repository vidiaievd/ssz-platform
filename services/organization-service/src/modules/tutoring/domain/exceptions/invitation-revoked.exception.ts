export class TutoringInvitationRevokedException extends Error {
  constructor(id: string) {
    super(`Tutoring invitation ${id} has been revoked`);
    this.name = 'TutoringInvitationRevokedException';
  }
}
