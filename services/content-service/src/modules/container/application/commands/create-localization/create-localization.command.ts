export class CreateLocalizationCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly languageCode: string,
    public readonly title: string,
    public readonly description?: string,
  ) {}
}
