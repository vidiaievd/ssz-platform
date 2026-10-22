import type { AttemptReviewedAiDraft } from '@ssz/contracts';

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

/** The settled draft, as stored beside what the model offered. */
export interface SettledOutcomes {
  /** One per remark, in the draft's order. */
  remarks: RemarkOutcome[];
  /** `null` when the draft had no overall note. */
  summary: RemarkOutcome | null;
  /** The reviewer dropped the draft as a whole. */
  draftDiscarded: boolean;
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
  draft: { remarkCount: number; hasSummary: boolean },
  outcomes: ReviewerOutcomes,
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
  };
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

/** The counts `exercise.attempt.reviewed` carries — remarks only, the overall note aside. */
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
