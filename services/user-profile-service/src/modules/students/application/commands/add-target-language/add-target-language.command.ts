export class AddTargetLanguageCommand {
  constructor(
    readonly userId: string,
    readonly languageCode: string,
  ) {}
}
