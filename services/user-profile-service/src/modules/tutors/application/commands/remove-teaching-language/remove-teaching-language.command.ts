export class RemoveTeachingLanguageCommand {
  constructor(
    readonly userId: string,
    readonly languageCode: string,
  ) {}
}
