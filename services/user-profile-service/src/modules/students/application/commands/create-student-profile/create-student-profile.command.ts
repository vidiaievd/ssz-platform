import type { TargetLanguage } from '../../../domain/value-objects/target-language.vo.js';

export class CreateStudentProfileCommand {
  constructor(
    readonly userId: string,
    readonly nativeLanguage?: string,
    readonly targetLanguages?: TargetLanguage[],
  ) {}
}
