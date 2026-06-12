export class TutoringInvitationResendThrottledException extends Error {
  constructor(minutesRemaining: number) {
    super(`Too many resend attempts. Try again in ${minutesRemaining} minute(s)`);
    this.name = 'TutoringInvitationResendThrottledException';
  }
}
