export class InvalidMembershipTransitionException extends Error {
  constructor(from: string, to: string) {
    super(`Invalid membership transition: ${from} → ${to}`);
    this.name = 'InvalidMembershipTransitionException';
  }
}
