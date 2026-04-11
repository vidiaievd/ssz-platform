export class MemberAlreadyExistsException extends Error {
  constructor(userId: string, schoolId: string) {
    super(`User ${userId} is already a member of school ${schoolId}`);
    this.name = 'MemberAlreadyExistsException';
  }
}
