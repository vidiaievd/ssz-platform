import type { Proficiency } from '../../../domain/value-objects/teaching-language.vo.js';

export class AddTeachingLanguageCommand {
  constructor(
    readonly userId: string,
    readonly languageCode: string,
    readonly proficiency: Proficiency,
  ) {}
}
