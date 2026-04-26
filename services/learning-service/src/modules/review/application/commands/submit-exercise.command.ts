export class SubmitExerciseCommand {
  constructor(
    public readonly userId: string,
    public readonly exerciseId: string,
    public readonly content: { text?: string; mediaRefs?: string[] },
    public readonly assignmentId?: string,
    public readonly schoolId?: string,
  ) {}
}
