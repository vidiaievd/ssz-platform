/** A learner's exercises whose latest scored attempt failed — VoxOrd plan 05, step 8. */
export class ListMyMistakesQuery {
  constructor(
    public readonly userId: string,
    /** One course only; null for every course. */
    public readonly courseId: string | null,
    public readonly limit: number,
  ) {}
}
