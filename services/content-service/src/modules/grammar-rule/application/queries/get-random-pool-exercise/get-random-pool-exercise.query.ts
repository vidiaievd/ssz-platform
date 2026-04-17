export class GetRandomPoolExerciseQuery {
  constructor(
    public readonly ruleId: string,
    /** Exercise IDs the student has already seen in this session — excluded from selection. */
    public readonly excludeExerciseIds: string[] = [],
  ) {}
}
