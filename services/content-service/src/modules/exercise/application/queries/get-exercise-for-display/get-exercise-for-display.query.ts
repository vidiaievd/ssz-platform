/** Used by the student-facing endpoint. Instructions are loaded; answers are omitted in the response DTO. */
export class GetExerciseForDisplayQuery {
  constructor(
    public readonly exerciseId: string,
    public readonly preferredInstructionLanguage?: string,
  ) {}
}
