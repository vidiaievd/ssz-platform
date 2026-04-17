export class UpsertExerciseInstructionCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly instructionLanguage: string,
    public readonly instructionText: string,
    public readonly hintText?: string | null,
    public readonly textOverrides?: Record<string, unknown> | null,
  ) {}
}
