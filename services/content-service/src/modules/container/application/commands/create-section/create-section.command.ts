export class CreateSectionCommand {
  constructor(
    public readonly userId: string,
    public readonly versionId: string,
    public readonly title: string,
    public readonly position?: number,
  ) {}
}
