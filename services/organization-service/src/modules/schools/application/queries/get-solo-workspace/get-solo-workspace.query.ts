export class GetSoloWorkspaceQuery {
  constructor(
    /** The tutor who owns the workspace. */
    public readonly ownerId: string,
  ) {}
}
