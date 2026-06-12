export class UpdateWorkloadPolicyCommand {
  constructor(
    public readonly schoolId: string,
    public readonly prepFactor?: number,
    public readonly dailyContactCap?: number,
    public readonly maxConsecutive?: number,
    public readonly nearCapRatio?: number,
  ) {}
}
