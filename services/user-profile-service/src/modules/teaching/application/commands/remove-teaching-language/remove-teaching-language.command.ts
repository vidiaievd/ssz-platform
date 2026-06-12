export class RemoveTeachingLanguageCommand {
  constructor(
    readonly userId: string,
    readonly code: string,
  ) {}
}
