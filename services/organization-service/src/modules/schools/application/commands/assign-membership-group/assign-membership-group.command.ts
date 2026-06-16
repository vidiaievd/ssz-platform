export class AssignMembershipGroupCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
    readonly groupId: string,
  ) {}
}
