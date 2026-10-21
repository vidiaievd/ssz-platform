export class TestModelCommand {
  constructor(
    public readonly modelId: string,
    public readonly actorUserId: string,
    public readonly actorRole: string | null,
  ) {}
}
