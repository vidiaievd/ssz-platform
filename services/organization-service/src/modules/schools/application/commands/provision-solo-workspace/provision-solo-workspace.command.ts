export class ProvisionSoloWorkspaceCommand {
  constructor(
    /** The tutor who owns the workspace — also its only teacher. */
    public readonly tutorId: string,
    /**
     * What to call the workspace and its first group. Never shown to a learner as a
     * school; used for the tutor's own screens and for migrating an existing
     * tutoring group under its own name.
     */
    public readonly name?: string,
    public readonly description?: string,
    public readonly avatarUrl?: string,
  ) {}
}
