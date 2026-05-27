export class UpdateStudentProfileCommand {
  constructor(
    readonly userId: string,
    readonly nativeLanguage?: string,
  ) {}
}
