export class DeleteExerciseCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
  ) {}
}
