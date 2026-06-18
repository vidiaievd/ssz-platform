export class MembershipNotFoundException extends Error {
  constructor(id: string) {
    super(`School membership not found: ${id}`);
    this.name = 'MembershipNotFoundException';
  }
}
