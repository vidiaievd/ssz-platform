export class UpdateContainerItemCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly isRequired?: boolean,
    public readonly sectionId?: string | null,
    public readonly sectionLabel?: string | null,
    public readonly xpReward?: number | null,
  ) {}
}
