export class CreateTutorProfileCommand {
  constructor(
    readonly userId: string,
    readonly hourlyRate?: number,
    readonly yearsOfExperience?: number,
  ) {}
}
