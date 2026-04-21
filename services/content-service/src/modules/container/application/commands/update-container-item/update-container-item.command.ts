export class UpdateContainerItemCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly isRequired?: boolean,
    public readonly sectionLabel?: string | null,
  ) {}
}
