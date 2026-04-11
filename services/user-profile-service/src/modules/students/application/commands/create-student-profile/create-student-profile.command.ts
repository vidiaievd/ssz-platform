export class CreateStudentProfileCommand {
  constructor(
    readonly userId: string,
    readonly nativeLanguage?: string,
  ) {}
}
