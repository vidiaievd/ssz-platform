export class DeleteLocalizationCommand {
  constructor(
    public readonly userId: string,
    public readonly containerId: string,
    public readonly languageCode: string,
  ) {}
}
