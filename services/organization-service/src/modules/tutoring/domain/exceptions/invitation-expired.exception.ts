export class TutoringInvitationExpiredException extends Error {
  constructor(id: string) {
    super(`Tutoring invitation ${id} has expired`);
    this.name = 'TutoringInvitationExpiredException';
  }
}
