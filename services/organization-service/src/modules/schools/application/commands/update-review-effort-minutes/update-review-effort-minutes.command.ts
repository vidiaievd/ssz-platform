/**
 * The minutes a school sets, whole: a template left out goes back to the factory value,
 * and `other: null` does the same for templates on neither list.
 */
export class UpdateReviewEffortMinutesCommand {
  constructor(
    public readonly schoolId: string,
    public readonly actorId: string,
    public readonly templates: Record<string, number>,
    public readonly other: number | null,
  ) {}
}
