export class AddTeachingLanguageCommand {
  constructor(
    readonly userId: string,
    readonly code: string,
    readonly level: string | undefined,
  ) {}
}
