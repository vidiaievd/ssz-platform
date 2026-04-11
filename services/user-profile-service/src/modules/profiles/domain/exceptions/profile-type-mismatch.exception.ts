export class ProfileTypeMismatchException extends Error {
  constructor(userId: string, expected: string, actual: string) {
    super(
      `Profile for user ${userId} has type ${actual}, but ${expected} is required`,
    );
    this.name = 'ProfileTypeMismatchException';
  }
}
