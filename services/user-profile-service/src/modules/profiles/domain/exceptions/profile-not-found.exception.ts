export class ProfileNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Profile not found: ${identifier}`);
    this.name = 'ProfileNotFoundException';
  }
}
