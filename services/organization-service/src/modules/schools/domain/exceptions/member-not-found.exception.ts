export class MemberNotFoundException extends Error {
  constructor(userId: string) {
    super(`Member with userId "${userId}" not found in this school`);
    this.name = 'MemberNotFoundException';
  }
}
