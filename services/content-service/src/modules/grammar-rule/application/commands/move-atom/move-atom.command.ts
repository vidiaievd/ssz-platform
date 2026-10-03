export class MoveAtomCommand {
  constructor(
    public readonly userId: string,
    public readonly isPlatformAdmin: boolean,
    public readonly ruleId: string,
    public readonly atomId: string,
    public readonly targetRuleId: string,
    /** Required only when the destination already holds a living atom under this key. */
    public readonly key?: string,
  ) {}
}
