import type {
  AttemptReviewedAiDraft,
  AttemptReviewedAiVerdict,
  ExerciseAttemptAiReviewDisputedPayload,
  ExerciseAttemptAiReviewedPayload,
} from '@ssz/contracts';

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
  disputes: number;
  teacherVerdicts: number;
  teacherOverturned: number;
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
  /** Learners who said a model's review of their work was wrong (2.3b) — `review_direct` only. */
  disputes: number;
  /**
   * Share of a model's reviews its learners disputed; null with none delivered, and on
   * `review_draft`, where a teacher's discard is the label and learners never see the draft.
   */
  disputeRate: number | null;
  /**
   * Teachers' verdicts on school work this model had answered first (plan 80, step 6c), apart
   * from `reviews` — the verdicts it delivered. `overturned`: the teacher went the other way
   * (approved ↔ returned); `overturnRate` is over `total`, null with none. Zeros on
   * `review_draft`, whose drafts give no verdict to overturn.
   */
  teacherVerdicts: { total: number; overturned: number; overturnRate: number | null };
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
        disputes: 0,
        disputeRate: null,
        teacherVerdicts: { total: 0, overturned: 0, overturnRate: null },
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
    group.disputes += row.disputes;
    group.teacherVerdicts.total += row.teacherVerdicts;
    group.teacherVerdicts.overturned += row.teacherOverturned;
  }

  for (const [key, group] of groups) {
    const r = group.remarks;
    r.total = r.accepted + r.edited + r.discarded + r.untouched;
    group.takenRate = share(r.accepted + r.edited, r.total);
    const m = group.marks;
    m.agreement = share(m.same, m.same + m.different);
    m.meanAbsDelta = share(sums.get(key)!.absDelta, m.compared);
    m.bias = share(sums.get(key)!.delta, m.compared);
    if (group.capability === 'review_direct') group.disputeRate = share(group.disputes, group.reviews);
    const t = group.teacherVerdicts;
    t.overturnRate = share(t.overturned, t.total);
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

/** One increment of `ai_draft_quality_daily` a teacher's letter makes: the row, and the counts. */
export interface ReviewedIncrement {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  /** 1 for a teacher's verdict on a `review_draft` draft; a `review_direct` draft adds none. */
  reviews: number;
  remarks: { accepted: number; edited: number; discarded: number; untouched: number };
  marks: { reviews: number; same: number; different: number; compared: number; deltaSum: number; absDeltaSum: number };
  teacherVerdicts: number;
  teacherOverturned: number;
}

/**
 * What a teacher's letter (`exercise.attempt.reviewed`) adds to the quality fold — none, one
 * or two increments; `null` for a letter that should be read and cannot.
 *
 * - `aiDraft` — the remarks and marks the teacher acted on. On a `review_draft` row it is
 *   also a review: the verdict given with the draft on screen. On `review_direct` it is not
 *   (plan 80, step 6c): there `reviews` are the verdicts a model delivered, the denominator of
 *   its dispute rate, and a teacher's verdict is counted apart.
 * - `aiVerdict` — the model's verdict the learner had been given at a school that lets a model
 *   answer first: a teacher's verdict, overturned when the outcome differs. Carried whether
 *   the teacher acted on the review or not (a batch approval too), so it is its own count.
 *
 * Both name the same `review_direct` draft when both are there; the two increments then land
 * on one row, which the fold adds up as any other.
 */
export function reviewedIncrements(payload: unknown): ReviewedIncrement[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const increments: ReviewedIncrement[] = [];

  if (p.aiDraft !== undefined && p.aiDraft !== null) {
    if (!isFoldableDraft(p.aiDraft)) return null;
    const d = p.aiDraft;
    const m = d.marks ?? null;
    increments.push({
      ...axesOf(d),
      reviews: d.capability === 'review_direct' ? 0 : 1,
      remarks: { accepted: d.accepted, edited: d.edited, discarded: d.discarded, untouched: d.untouched },
      marks: {
        reviews: m === null ? 0 : 1,
        same: m?.same ?? 0,
        different: m?.different ?? 0,
        compared: m?.compared ?? 0,
        deltaSum: m?.deltaSum ?? 0,
        absDeltaSum: m?.absDeltaSum ?? 0,
      },
      teacherVerdicts: 0,
      teacherOverturned: 0,
    });
  }

  if (p.aiVerdict !== undefined) {
    if (!isFoldableAiVerdict(p.aiVerdict) || !isOutcome(p.outcome)) return null;
    increments.push({
      ...axesOf(p.aiVerdict),
      reviews: 0,
      remarks: { accepted: 0, edited: 0, discarded: 0, untouched: 0 },
      marks: { reviews: 0, same: 0, different: 0, compared: 0, deltaSum: 0, absDeltaSum: 0 },
      teacherVerdicts: 1,
      teacherOverturned: p.outcome === p.aiVerdict.outcome ? 0 : 1,
    });
  }
  return increments;
}

function axesOf(v: { capability: string; modelId: string | null; promptVersion: string | null }) {
  return { capability: v.capability, modelId: v.modelId, promptVersion: v.promptVersion };
}

function isFoldableAiVerdict(value: unknown): value is AttemptReviewedAiVerdict {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const nullableString = (x: unknown) => x === null || typeof x === 'string';
  return (
    typeof v.capability === 'string' &&
    nullableString(v.modelId) &&
    nullableString(v.promptVersion) &&
    isOutcome(v.outcome)
  );
}

function isOutcome(value: unknown): value is 'approved' | 'returned' {
  return value === 'approved' || value === 'returned';
}

/** A model's verdict on a learner's work (2.3b): the axes and the day the fold reads. */
export function isFoldableAiReview(value: unknown): value is ExerciseAttemptAiReviewedPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  const nullableString = (v: unknown) => v === null || typeof v === 'string';
  return (
    typeof p.capability === 'string' &&
    nullableString(p.modelId) &&
    nullableString(p.promptVersion) &&
    isDay(p.occurredAt)
  );
}

/** A dispute of one: the same axes, counted on `reviewedAt`. */
export function isFoldableDispute(value: unknown): value is ExerciseAttemptAiReviewDisputedPayload {
  return isFoldableAiReview(value) && isDay((value as unknown as Record<string, unknown>).reviewedAt);
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
