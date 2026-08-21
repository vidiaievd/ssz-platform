// Model for the `match_pairs` exercise, variants `halves` and `pairs`.
//
// Source of truth: docs/design/activity-specs/design_handoff_match_pairs/SPEC_data_model.md
// in ssz-platform-web, as amended by the decisions in docs/plan/49-match-pairs.md.
//
// The governing rule, as in `word_bank_gap_fill`: **store what the teacher typed, derive
// everything else.** The right-hand pool, its numbering, coverage and validity are never
// persisted — see selectors.ts. A pair is written once, whole, split at the point the
// student must think about: `right` *is* the answer for `left`, so there is no answer key
// to keep in sync and nothing can drift.

/**
 * What the two columns mean, which is a difference in kind and not only in copy.
 *
 * - `halves` — one sentence cut in two. The right half is wrong because of grammar the
 *   student cannot see unaided, which is why an explanation is required to publish.
 * - `pairs` — word ↔ translation, term ↔ definition. The right half is wrong because it
 *   belongs to another left half, which the student can see for themselves.
 *
 * The spec is written for `halves`; every exercise on the platform today is `pairs`. One
 * model serves both (SPEC_data_model, "Reserved: other match_pairs variants") and the
 * variant changes copy, the reading-font treatment, and the level of `FB_NO_DEFAULT`.
 */
export type Variant = 'halves' | 'pairs';

/** Identifies a pair, and so the left half and the row of the feedback matrix. */
export type PairId = string;

/**
 * Identifies one item of the right-hand pool — a pair's own right half, or a distractor.
 *
 * Deliberately **not** the `PairId`, which is what the spec prescribes (SPEC_data_model,
 * "Key identity rule"). The spec then has to hand the student opaque per-attempt ids to
 * stop the payload from being the answer key (AC-S15), and that costs a mapping stored
 * on every attempt. An id of its own, minted from the same generator for answers and
 * distractors alike, buys the same guarantee for nothing: slots and pool items share no
 * identifier, and the pool order is still shuffled server-side per attempt.
 *
 * See docs/plan/49-match-pairs.md, decision 2.
 */
export type RightId = string;

export interface Pair {
  /** Stable, generated client-side. Keys the feedback matrix row. */
  id: PairId;
  /** This pair's right half *as an item of the pool*. Never equal to `id`. */
  rightId: RightId;
  /** "Hvis det regner i morgen," */
  left: string;
  /** "blir vi hjemme." — this IS the answer for `left`. */
  right: string;
}

/** An extra right half that completes nothing. Same shape as a pool answer, by design. */
export interface Distractor {
  id: RightId;
  text: string;
}

export interface Settings {
  /** Include the extra halves in the pool. Turning it off hides them; it never deletes them. */
  distractors: boolean;
  /** Randomise pool order per student and attempt. Applied server-side; not a kernel concern. */
  shuffle: boolean;
  /** "N igjen" above the pool. */
  showRemaining: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  distractors: true,
  shuffle: true,
  showRemaining: true,
};

/**
 * The task itself — everything needed to render it and to know what the answers are.
 * Exactly what the `content` column holds, and all the student projection needs to read.
 */
export interface MatchTask {
  variant: Variant;
  settings: Settings;
  /** Author order. Drives the left column; the right halves are shuffled anyway. */
  pairs: Pair[];
  distractors: Distractor[];
}

/**
 * Where an override came from. Stored from day one, as in `word_bank_gap_fill`, so that
 * introducing AI drafting (plan 48) needs no migration. Only `author` text reaches a
 * student or counts towards coverage; an unaccepted draft is not an explanation yet.
 */
export type FeedbackOrigin = 'author' | 'ai_draft';

export interface Override {
  text: string;
  origin: FeedbackOrigin;
}

export interface PairFeedback {
  /** Shown for any wrong half with no override of its own. Required to publish a `halves` set. */
  def: string;
  /** Why the right half is the right one. Shown only on reveal. Optional. */
  why: string;
  /** Pool item → why attaching *that* half to *this* left half is wrong. */
  ov: Record<RightId, Override>;
}

export interface MatchPairs extends MatchTask {
  id: string;
  type: 'match_pairs';
  moduleId: string;
  /** Shown to students. */
  title: string;
  /** Short, in the target language. */
  instructions: string;
  feedback: Record<PairId, PairFeedback>;
  /** ISO. Doubles as the autosave concurrency token. */
  updatedAt: string;
}

// Note the absence of `state: "draft" | "ready"` from the spec: readiness is decided by
// the platform's existing container pre-flight, and a second readiness model would
// contend with it. Same call as plan 35, decision 5.

/** An item of the right-hand pool, with everything derivable about it. Never persisted. */
export interface RightItem {
  id: RightId;
  text: string;
  kind: 'answer' | 'distractor';
  /** 1-based position of the owning pair, for answers only. Renumbers on reorder. */
  n?: number;
}

export interface Coverage {
  /** Σ over complete pairs of (pool size − 1, excluding the pair's own half). */
  total: number;
  /** Cells with authored override text. Unaccepted AI drafts do not count. */
  written: number;
  /** Pairs with no default explanation — the `FB_NO_DEFAULT` issue. */
  noDefault: number;
  /** `written / total` as a percentage; 0 when there is nothing to cover. */
  pct: number;
  pairs: number;
}

/** One half attached to one left half. What the student's client posts. */
export interface Placement {
  pairId: PairId;
  rightId: RightId;
}

export interface PairResult {
  pairId: PairId;
  correct: boolean;
  /** Resolved explanation, or `null` when the teacher wrote none that applies. */
  explanation: string | null;
}
