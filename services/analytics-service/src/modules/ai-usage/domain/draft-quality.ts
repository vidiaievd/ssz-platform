import type { AttemptReviewedAiDraft } from '@ssz/contracts';

/** One stored row of `ai_draft_quality_daily`, as the reader needs it. */
export interface DraftQualityRow {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  reviews: number;
  remarksAccepted: number;
  remarksEdited: number;
  remarksDiscarded: number;
  remarksUntouched: number;
  reviewsWithMarks: number;
  marksSame: number;
  marksDifferent: number;
  marksCompared: number;
  marksDeltaSum: number;
  marksAbsDeltaSum: number;
}

/** Suggested rubric marks against the teachers' over the range (plan 79, 1.7d). */
export interface DraftMarksQuality {
  /** Verdicts on drafts that suggested marks. */
  reviews: number;
  same: number;
  different: number;
  /** Marks with a teacher's number beside them — what the two means are over. */
  compared: number;
  /** Share of suggested marks the teacher gave as well; null with none. */
  agreement: number | null;
  /** Mean |teacher − model| in rubric levels; null with nothing compared. */
  meanAbsDelta: number | null;
  /** Mean (teacher − model): above zero the model marks lower than teachers, below — higher. */
  bias: number | null;
}

/** One model and prompt version over the whole range asked for. */
export interface DraftQualityGroup {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  reviews: number;
  remarks: { accepted: number; edited: number; discarded: number; untouched: number; total: number };
  /**
   * Share of remarks that reached the student, as written or reworded — `null` with no
   * remarks. Rounded to four places; the counts beside it are the exact figures.
   */
  takenRate: number | null;
  marks: DraftMarksQuality;
}

/**
 * Days folded away: the quality of a model and prompt is read over a period, and the axes
 * it is compared on are exactly agent × model × prompt version (plan 79 §1.5).
 */
export function aggregateDraftQuality(rows: DraftQualityRow[]): DraftQualityGroup[] {
  const groups = new Map<string, DraftQualityGroup>();
  // The delta sums are read only as means, so they stay out of the group.
  const sums = new Map<string, { delta: number; absDelta: number }>();
  for (const row of rows) {
    const key = JSON.stringify([row.capability, row.modelId, row.promptVersion]);
    let group = groups.get(key);
    if (!group) {
      group = {
        capability: row.capability,
        modelId: row.modelId,
        promptVersion: row.promptVersion,
        reviews: 0,
        remarks: { accepted: 0, edited: 0, discarded: 0, untouched: 0, total: 0 },
        takenRate: null,
        marks: { reviews: 0, same: 0, different: 0, compared: 0, agreement: null, meanAbsDelta: null, bias: null },
      };
      groups.set(key, group);
      sums.set(key, { delta: 0, absDelta: 0 });
    }
    group.reviews += row.reviews;
    group.remarks.accepted += row.remarksAccepted;
    group.remarks.edited += row.remarksEdited;
    group.remarks.discarded += row.remarksDiscarded;
    group.remarks.untouched += row.remarksUntouched;
    group.marks.reviews += row.reviewsWithMarks;
    group.marks.same += row.marksSame;
    group.marks.different += row.marksDifferent;
    group.marks.compared += row.marksCompared;
    sums.get(key)!.delta += row.marksDeltaSum;
    sums.get(key)!.absDelta += row.marksAbsDeltaSum;
  }

  for (const [key, group] of groups) {
    const r = group.remarks;
    r.total = r.accepted + r.edited + r.discarded + r.untouched;
    group.takenRate = share(r.accepted + r.edited, r.total);
    const m = group.marks;
    m.agreement = share(m.same, m.same + m.different);
    m.meanAbsDelta = share(sums.get(key)!.absDelta, m.compared);
    m.bias = share(sums.get(key)!.delta, m.compared);
  }
  return [...groups.values()];
}

/** Rounded to four places; the counts beside it are the exact figures. */
function share(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 10_000) / 10_000;
}

const COUNT_KEYS = ['accepted', 'edited', 'discarded', 'untouched'] as const;

const MARK_COUNT_KEYS = ['same', 'different', 'compared', 'absDeltaSum'] as const;

/**
 * Only what the fold reads is checked: four non-negative integer counts and the axes, and the
 * marks' counts when there are any (absent and null both mean the draft suggested none).
 */
export function isFoldableDraft(value: unknown): value is AttemptReviewedAiDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  const nullableString = (v: unknown) => v === null || typeof v === 'string';
  return (
    typeof draft.capability === 'string' &&
    nullableString(draft.modelId) &&
    nullableString(draft.promptVersion) &&
    COUNT_KEYS.every((key) => isCount(draft[key])) &&
    (draft.marks === undefined || draft.marks === null || isFoldableMarks(draft.marks))
  );
}

function isFoldableMarks(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const marks = value as Record<string, unknown>;
  return MARK_COUNT_KEYS.every((key) => isCount(marks[key])) && Number.isInteger(marks.deltaSum);
}

function isCount(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}
