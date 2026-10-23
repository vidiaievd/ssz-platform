import type { AttemptReviewedAiDraft, AttemptReviewedAiDraftMarks } from '@ssz/contracts';
import type { RubricMarks } from '@ssz/shared-kernel/writing-task';

/** What the reviewer did with one remark — or with the draft's overall note. */
export type RemarkOutcome = 'accepted' | 'edited' | 'discarded' | 'untouched';

/** What the reviewer can say they did; `untouched` is only ever inferred from silence. */
export const REVIEWER_OUTCOMES = ['accepted', 'edited', 'discarded'] as const;
export type ReviewerOutcome = (typeof REVIEWER_OUTCOMES)[number];

/** Where the review card keeps the draft-wide entries, beside the remarks' indices. */
export const DRAFT_KEY = 'draft';
export const SUMMARY_KEY = 'summary';

/**
 * The reviewer's outcomes as the card keeps them (plan 79, 1.4): a remark's index as a
 * string, `summary` for the overall note, `draft` for dropping the whole of it. An absent
 * key is something nobody acted on.
 */
export type ReviewerOutcomes = Record<string, ReviewerOutcome>;

/**
 * A suggested mark beside the one the teacher gave (plan 79, 1.7c). There is no "accepted":
 * the teacher sets every mark themselves, so the only thing to learn is whether they landed
 * where the model did. `delta` is theirs minus the model's — its sign says which way a model
 * leans; `null` when the criterion carries no valid mark from the verdict.
 */
export interface MarkOutcome {
  criterionId: string;
  outcome: 'same' | 'different';
  delta: number | null;
}

/** The settled draft, as stored beside what the model offered. */
export interface SettledOutcomes {
  /** One per remark, in the draft's order. */
  remarks: RemarkOutcome[];
  /** `null` when the draft had no overall note. */
  summary: RemarkOutcome | null;
  /** The reviewer dropped the draft as a whole. */
  draftDiscarded: boolean;
  /** One per suggested mark, in the draft's order; absent when the draft carried none. */
  marks?: MarkOutcome[];
}

export type SettledStatus = 'SENT' | 'EDITED' | 'DISCARDED';

/**
 * What a verdict made of a draft, remark by remark.
 *
 * Dropping the whole draft hides every remark from the reviewer, so the ones still open
 * become `discarded` — but a remark already taken into a comment before that stays taken:
 * its text reached the student. A key past the draft's last remark is ignored; the card
 * cannot have drawn it.
 */
export function settleOutcomes(
  draft: { remarkCount: number; hasSummary: boolean; marks?: ReadonlyArray<{ criterionId: string; mark: number }> | null },
  outcomes: ReviewerOutcomes,
  rubricMarks: RubricMarks | null = null,
): SettledOutcomes {
  const draftDiscarded = outcomes[DRAFT_KEY] === 'discarded';
  const open: RemarkOutcome = draftDiscarded ? 'discarded' : 'untouched';
  const read = (key: string): RemarkOutcome => {
    const outcome = outcomes[key];
    if (outcome === 'accepted' || outcome === 'edited') return outcome;
    return outcome === 'discarded' ? 'discarded' : open;
  };

  return {
    remarks: Array.from({ length: draft.remarkCount }, (_, index) => read(String(index))),
    summary: draft.hasSummary ? read(SUMMARY_KEY) : null,
    draftDiscarded,
    ...(draft.marks ? { marks: compareMarks(draft.marks, rubricMarks ?? {}) } : {}),
  };
}

/**
 * The model's marks against the teacher's. Dropping the draft does not touch them: a mark
 * is never taken from the draft, so the teacher's own mark is what it is compared with
 * either way. A criterion the verdict left without a valid mark (a `read_aloud`-style key,
 * an older card) counts as `different` with no delta — no agreement was shown.
 */
export function compareMarks(
  suggested: ReadonlyArray<{ criterionId: string; mark: number }>,
  given: RubricMarks,
): MarkOutcome[] {
  return suggested.map(({ criterionId, mark }) => {
    const teacher = given[criterionId];
    if (typeof teacher !== 'number' || !Number.isInteger(teacher) || teacher < 0 || teacher > 3) {
      return { criterionId, outcome: 'different', delta: null };
    }
    return { criterionId, outcome: teacher === mark ? 'same' : 'different', delta: teacher - mark };
  });
}

/**
 * The draft's status after a verdict: `EDITED` when anything was reworded, `SENT` when
 * something was taken as written, `DISCARDED` when nothing of it reached the student —
 * thrown out or simply left alone.
 */
export function settledStatus(settled: SettledOutcomes): SettledStatus {
  const taken = settled.summary === null ? settled.remarks : [...settled.remarks, settled.summary];
  if (taken.includes('edited')) return 'EDITED';
  if (taken.includes('accepted')) return 'SENT';
  return 'DISCARDED';
}

/**
 * The counts `exercise.attempt.reviewed` carries — remarks only, the overall note aside —
 * and, when the draft suggested rubric marks, how they compare with the teacher's.
 */
export function tallyOutcomes(
  settled: SettledOutcomes,
  draft: { capability: string; modelId: string | null; promptVersion: string | null },
): AttemptReviewedAiDraft {
  const count = (outcome: RemarkOutcome) =>
    settled.remarks.filter((remark) => remark === outcome).length;

  return {
    capability: draft.capability,
    modelId: draft.modelId,
    promptVersion: draft.promptVersion,
    accepted: count('accepted'),
    edited: count('edited'),
    discarded: count('discarded'),
    untouched: count('untouched'),
    marks: settled.marks ? tallyMarks(settled.marks) : null,
  };
}

/** The suggested marks' counts for the event (1.7d): agreement and which way the model leans. */
export function tallyMarks(marks: readonly MarkOutcome[]): AttemptReviewedAiDraftMarks {
  const compared = marks.flatMap((mark) => (mark.delta === null ? [] : [mark.delta]));
  return {
    same: marks.filter((mark) => mark.outcome === 'same').length,
    different: marks.filter((mark) => mark.outcome === 'different').length,
    compared: compared.length,
    deltaSum: compared.reduce((sum, delta) => sum + delta, 0),
    absDeltaSum: compared.reduce((sum, delta) => sum + Math.abs(delta), 0),
  };
}

/**
 * The outcomes as they arrive over the wire, with anything the card could not have written
 * dropped: keys other than an index, `summary` or `draft`, and values outside the three a
 * reviewer can choose. `null` stays `null` — no draft was shown.
 */
export function readReviewerOutcomes(raw: unknown): ReviewerOutcomes | null {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const outcomes: ReviewerOutcomes = {};
  for (const [key, value] of Object.entries(raw)) {
    const keyKnown = /^\d+$/.test(key) || key === SUMMARY_KEY || key === DRAFT_KEY;
    if (keyKnown && (REVIEWER_OUTCOMES as readonly unknown[]).includes(value)) {
      outcomes[key] = value as ReviewerOutcome;
    }
  }
  return outcomes;
}
