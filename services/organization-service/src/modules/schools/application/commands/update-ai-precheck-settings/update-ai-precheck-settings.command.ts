/** Whether learners may rehearse with a model, and the school's limits on it, set whole. */
export class UpdateAiPrecheckSettingsCommand {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
    public readonly enabled: boolean,
    public readonly perExerciseLimit: number | null,
    public readonly perLearnerMonthlyCredits: number | null,
  ) {}
}
