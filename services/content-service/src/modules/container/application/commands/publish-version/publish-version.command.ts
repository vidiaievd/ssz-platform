export class PublishVersionCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly sunsetPeriodDays?: number,
  ) {}
}
