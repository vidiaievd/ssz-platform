/**
 * The `contentId` of an `EXERCISE_GAP` card: which gap, inside which exercise.
 *
 * A card per gap, rather than per exercise (plan 36 §C.1). With one card standing for
 * the whole exercise, a block of six sentences is a single card: get one wrong and all
 * six come back. Before gap-fill was merged into one template, six separate exercises
 * gave six independent cards — this gives that back, finer than it was.
 *
 * Composite rather than a foreign key because the gap has no id of its own: it is a
 * marker inside the exercise's own text, and gapKey is what identifies it everywhere
 * else — in the author's answer matrix, in the validator, in the learner's feedback.
 */
const SEPARATOR = '#';

export function gapCardContentId(exerciseId: string, gapKey: string): string {
  return `${exerciseId}${SEPARATOR}${gapKey}`;
}

/**
 * Splits one back apart, or null if it is not one.
 *
 * Splits on the first separator only: gapKey is the part that is author-supplied, so
 * it is the part that might contain a `#`.
 */
export function parseGapCardContentId(
  contentId: string,
): { exerciseId: string; gapKey: string } | null {
  const at = contentId.indexOf(SEPARATOR);
  if (at <= 0 || at === contentId.length - 1) return null;
  return {
    exerciseId: contentId.slice(0, at),
    gapKey: contentId.slice(at + 1),
  };
}
