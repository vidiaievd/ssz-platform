export class TutorProfileAlreadyExistsException extends Error {
  constructor(profileId: string) {
    super(`Tutor profile already exists for profile: ${profileId}`);
    this.name = 'TutorProfileAlreadyExistsException';
  }
}
