export class NudgeAtRiskCommand {
  constructor(
    public readonly schoolId: string,
    public readonly requestedBy: string,
  ) {}
}
