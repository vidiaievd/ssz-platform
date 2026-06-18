export class RejectMembershipCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
  ) {}
}
