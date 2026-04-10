export class StudentProfileAlreadyExistsException extends Error {
  constructor(profileId: string) {
    super(`Student profile already exists for profile: ${profileId}`);
    this.name = 'StudentProfileAlreadyExistsException';
  }
}
