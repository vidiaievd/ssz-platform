export class CompleteMembershipOnboardingCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
  ) {}
}
