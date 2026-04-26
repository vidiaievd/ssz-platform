export class GetSubmissionQuery {
  constructor(
    public readonly submissionId: string,
    public readonly requestingUserId: string,
    public readonly requestingUserRoles: string[],
  ) {}
}
