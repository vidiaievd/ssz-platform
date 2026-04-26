export class GetAssignmentProgressQuery {
  constructor(
    public readonly assignmentId: string,
    public readonly requestingUserId: string,
  ) {}
}
