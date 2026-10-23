/** One criterion of the rubric the text is marked by, as frozen on the attempt when it was queued. */
export interface RubricCriterion {
  /** The snapshot's id — what the teacher's marks are keyed by. */
  id: string;
  name: string;
  desc: string;
  weight: 1 | 2;
  /** Descriptors of levels 0, 1, 2, 3, in that order. */
  levels: [string, string, string, string];
}

/**
 * A suggested mark on one criterion (plan 79, step 1.7c). The teacher sees it beside their
 * own control and sets the mark themselves: a hint never fills the rubric in.
 */
export interface RubricHint {
  criterionId: string;
  mark: 0 | 1 | 2 | 3;
  /** One sentence on why this level, for the teacher. */
  reason: string;
}

/** The marks as the model returns them; `criterionIndex` is mapped to the snapshot's id afterwards. */
interface RawHint {
  criterionIndex: number;
  mark: number;
  reason: string;
}

/**
 * The `marks` property of the answer schema: one entry per criterion, by its 1-based number.
 * A number rather than the snapshot's id, as sentences are numbered rather than named —
 * the ids are random strings a model has no reason to copy faithfully.
 */
export function marksSchema(rubric: readonly RubricCriterion[]): Record<string, unknown> {
  return {
    type: 'array',
    description: 'One suggested mark per rubric criterion, each criterion exactly once',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['criterionIndex', 'mark', 'reason'],
      properties: {
        criterionIndex: {
          type: 'integer',
          minimum: 1,
          maximum: rubric.length,
          description: 'Number of the criterion, as numbered in the rubric',
        },
        mark: { type: 'integer', enum: [0, 1, 2, 3], description: 'The level whose descriptor fits the text best' },
        reason: { type: 'string', minLength: 1, description: 'One sentence for the teacher on why this level' },
      },
    },
  };
}

/**
 * What the schema cannot check: every criterion is marked exactly once. A rubric with a
 * criterion left out or marked twice would show the teacher a hint on some rows and two on
 * another — the answer is refused instead.
 */
export function verifyMarks(rubric: readonly RubricCriterion[], marks: unknown): string | null {
  if (!Array.isArray(marks)) return 'marks are missing';
  const seen = new Set<number>();
  for (const hint of marks as RawHint[]) {
    if (hint.criterionIndex < 1 || hint.criterionIndex > rubric.length) {
      return `criterion ${hint.criterionIndex} does not exist`;
    }
    if (seen.has(hint.criterionIndex)) return `criterion ${hint.criterionIndex} is marked twice`;
    seen.add(hint.criterionIndex);
  }
  if (seen.size !== rubric.length) return `${rubric.length - seen.size} criteria are not marked`;
  return null;
}

/** The verified marks in the rubric's order, indices resolved to the snapshot's ids. */
export function toRubricHints(rubric: readonly RubricCriterion[], marks: unknown): RubricHint[] {
  const byIndex = new Map((marks as RawHint[]).map((hint) => [hint.criterionIndex, hint]));
  return rubric.map((criterion, index) => {
    const hint = byIndex.get(index + 1)!;
    return { criterionId: criterion.id, mark: hint.mark as RubricHint['mark'], reason: hint.reason.trim() };
  });
}
