import type { StudentPreferencesPatch } from '../../../domain/entities/student-profile.entity.js';

export class UpdateStudentPreferencesCommand {
  constructor(
    readonly userId: string,
    readonly patch: StudentPreferencesPatch,
  ) {}
}
