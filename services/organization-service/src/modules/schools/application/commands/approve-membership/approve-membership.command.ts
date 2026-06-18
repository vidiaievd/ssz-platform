export class ApproveMembershipCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
  ) {}
}
