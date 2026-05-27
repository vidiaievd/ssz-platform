export class UpdateTutorProfileCommand {
  constructor(
    readonly userId: string,
    readonly hourlyRate?: number,
    readonly yearsOfExperience?: number,
  ) {}
}
