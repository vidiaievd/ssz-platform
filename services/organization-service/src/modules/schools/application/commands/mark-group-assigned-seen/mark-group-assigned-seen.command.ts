export class MarkGroupAssignedSeenCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
  ) {}
}
