export class StudentProfileNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Student profile not found: ${identifier}`);
    this.name = 'StudentProfileNotFoundException';
  }
}
