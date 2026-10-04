/**
 * Lets go of the review cards on the pieces an exercise no longer has (plan 68).
 *
 * `itemKeys` are the pieces the released document still has, spelled as its per-item
 * verdicts spell them. Every `EXERCISE_GAP` card on the exercise keyed otherwise is deleted.
 */
export class PruneGapCardsCommand {
  constructor(
    readonly exerciseId: string,
    readonly itemKeys: readonly string[],
  ) {}
}
