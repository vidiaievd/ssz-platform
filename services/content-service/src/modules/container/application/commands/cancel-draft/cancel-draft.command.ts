export class CancelDraftCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
  ) {}
}
