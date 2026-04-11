export class TutorProfileNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Tutor profile not found: ${identifier}`);
    this.name = 'TutorProfileNotFoundException';
  }
}
