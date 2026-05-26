import type { TeachingLanguage } from '../../../domain/value-objects/teaching-language.vo.js';

export class CreateTutorProfileCommand {
  constructor(
    readonly userId: string,
    readonly hourlyRate?: number,
    readonly yearsOfExperience?: number,
    readonly teachingLanguages?: TeachingLanguage[],
  ) {}
}
