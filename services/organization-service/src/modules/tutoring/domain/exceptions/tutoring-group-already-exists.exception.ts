export class TutoringGroupAlreadyExistsException extends Error {
  constructor(tutorId: string) {
    super(`Tutor ${tutorId} already has a tutoring group`);
    this.name = 'TutoringGroupAlreadyExistsException';
  }
}
