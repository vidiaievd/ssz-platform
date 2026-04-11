export class ProfileAlreadyExistsException extends Error {
  constructor(userId: string) {
    super(`Profile already exists for user: ${userId}`);
    this.name = 'ProfileAlreadyExistsException';
  }
}
