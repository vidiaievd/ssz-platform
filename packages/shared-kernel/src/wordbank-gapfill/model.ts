// Model for the `word_bank_gap_fill` exercise.
//
// Source of truth: docs/design/activity-specs/design_handoff_wordbank_gapfill/SPEC_data_model.md
// in ssz-platform-web, as amended by the decisions in docs/plan/35-wordbank-gapfill-redesign.md.
//
// The governing rule: **store what the teacher typed, derive everything else.** Gap
// labels, the word bank, coverage and validity are never persisted — see selectors.ts.
// The sentence is stored solved, so the answer is a slice of `Sentence.text`; renaming a
// word in the text moves the answer, the bank and the matrix column in one edit.

/** `${sentence.id}#${tokenIndex}` — e.g. `"s1#3"`. Positional labels are never stored. */
export type GapKey = string;

export interface Sentence {
  /** Stable, generated client-side. Referenced by every `GapKey`. */
  id: string;
  /** Solved form, e.g. "Jeg vil gjerne bestille en kaffe." */
  text: string;
  /** Token indices (whitespace split), unordered. Indices past the end are stale — see `withSentenceText`. */
  gaps: number[];
  /** Optional, shown before the first check. */
  hint?: string;
}

/**
 * Where a pair explanation came from. Stored from day one (plan decision 6) so that
 * introducing AI drafting later needs no migration. Only `author` text reaches a
 * student or counts towards coverage; an unaccepted draft is not an explanation yet.
 */
export type FeedbackOrigin = 'author' | 'ai_draft';

export interface PairFeedback {
  text: string;
  origin: FeedbackOrigin;
}

export interface GapFeedback {
  /** Shown for any wrong word with no pair text of its own. Required for readiness. */
  fallback: string;
  /** Why the correct word is right. Shown on a correct gap and on reveal. Optional. */
  why: string;
  /** Bank word → why choosing *that* word here is wrong. Keyed by word text, so renaming a word orphans entries. */
  pairs: Record<string, PairFeedback>;
}

/**
 * How the student supplies the word (plan decision 4 — a setting, not a type).
 *
 * - `bank` — the spec's closed-set behaviour: a shared strip of chips, words consumed.
 * - `free` — no bank; the student types. `pairs` do not participate: explaining "why you
 *   chose that word" is meaningless when words are typed rather than chosen.
 */
export type InputMode = 'bank' | 'free';

export interface Settings {
  /** Randomise bank order per student and attempt. Applied server-side; not a kernel concern. */
  shuffle: boolean;
  /** A word may fill several gaps; its chip stays in the bank. */
  allowReuse: boolean;
  /** "N igjen" above the bank. */
  showBankCount: boolean;
  /** Compare answers case-sensitively. No UI yet. */
  caseSensitive: boolean;
  input: InputMode;
}

export const DEFAULT_SETTINGS: Settings = {
  shuffle: true,
  allowReuse: false,
  showBankCount: true,
  caseSensitive: false,
  input: 'bank',
};

export interface WordBankGapFill {
  id: string;
  type: 'word_bank_gap_fill';
  moduleId: string;
  /** Shown to students. */
  title: string;
  /** Short, in the target language. */
  instructions: string;
  settings: Settings;
  sentences: Sentence[];
  /** Wrong words added by the teacher, in author order. Filtered against answers when the bank is derived. */
  distractors: string[];
  feedback: Record<GapKey, GapFeedback>;
  /**
   * Additional accepted spellings per gap (plan decision 3). Honoured in `free` mode
   * only — in `bank` mode the set is closed and an "alternative" would just be another
   * chip. The spec omits this field because it does not consider the free-type scenario.
   */
  alternatives?: Record<GapKey, string[]>;
  /** ISO. Doubles as the autosave concurrency token. */
  updatedAt: string;
}

// Note the absence of `state: "draft" | "ready"` from the spec: readiness is decided by
// the platform's existing container pre-flight (plan decision 5), and a second readiness
// model would contend with it.

/** A gap in document order, with everything derivable about it. Never persisted. */
export interface Gap {
  key: GapKey;
  sentenceId: string;
  /** Position of the owning sentence in `sentences`. */
  sentenceIndex: number;
  tokenIndex: number;
  /** The token with surrounding punctuation stripped. */
  answer: string;
  /** `G1`…`Gn`, by document order. Renumbers when sentences are reordered. */
  label: string;
  /** The owning sentence's solved text. */
  sentence: string;
  hint?: string;
}

export interface BankWord {
  word: string;
  isAnswer: boolean;
}

export interface Coverage {
  /** Σ over gaps of (bank size − 1, excluding the gap's own answer). Zero in `free` mode. */
  total: number;
  /** Pairs with authored text. Unaccepted AI drafts do not count. */
  written: number;
  /** Gaps with no default explanation — the `FB_NO_FALLBACK` blocker. */
  noFallback: number;
  /** `written / total` as a percentage; 0 when there is nothing to cover. */
  pct: number;
  gaps: number;
}

export interface Placement {
  gapKey: GapKey;
  word: string;
}

export interface GapResult {
  gapKey: GapKey;
  correct: boolean;
  /** Resolved explanation, or `null` when the teacher wrote none that applies. */
  explanation: string | null;
}
