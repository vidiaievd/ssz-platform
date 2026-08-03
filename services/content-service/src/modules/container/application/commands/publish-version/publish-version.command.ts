export class PublishVersionCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly sunsetPeriodDays?: number,
    /** Author's note for this release, stored on the version being published. */
    public readonly changelog?: string,
  ) {}
}
