export class RemoveTargetLanguageCommand {
  constructor(
    readonly userId: string,
    readonly languageCode: string,
  ) {}
}
