export class StudentAlreadyExistsException extends Error {
  constructor(userId: string, tutorGroupId: string) {
    super(`User ${userId} is already a student in tutoring group ${tutorGroupId}`);
    this.name = 'StudentAlreadyExistsException';
  }
}
