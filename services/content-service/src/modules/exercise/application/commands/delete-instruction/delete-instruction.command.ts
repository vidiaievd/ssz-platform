export class DeleteExerciseInstructionCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly instructionId: string,
  ) {}
}
