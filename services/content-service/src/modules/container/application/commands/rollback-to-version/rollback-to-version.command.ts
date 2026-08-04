export class RollbackToVersionCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly versionId: string,
    public readonly sunsetPeriodDays?: number,
  ) {}
}
