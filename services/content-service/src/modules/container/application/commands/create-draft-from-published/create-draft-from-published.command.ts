export class CreateDraftFromPublishedCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
  ) {}
}
