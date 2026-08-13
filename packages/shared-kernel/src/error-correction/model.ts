// Model for the `error_correction` exercise.
//
// Source of truth: docs/design/activity-specs/design_handoff_error_correction/DATA_MODEL.md
// in ssz-platform-web, as amended by the decisions in docs/plan/41-error-correction.md.
//
// The governing rule: **the author writes two sentences, the engine derives the errors.**
// A mistake is never stored as a list entry — it is the difference between `wrong` and
// `ref`, recomputed on every read (see engine.ts). The author only ever overrides what
// was derived, keyed by a key that is itself derived, so an override cannot outlive the
// mistake it explains.
//
// The second rule, from the same handoff: **store the student's edits, not the finished
// text.** Everything the teacher UI and the diagnostics need — which mistakes were
// touched, which were hit, what was changed where there was no mistake — follows from
// the edits and cannot be recovered from a rewritten sentence.

/** The six kinds of mistake the engine can tell apart. */
export type SpanType = 'form' | 'order' | 'extra' | 'missing' | 'spelling' | 'function';

export const SPAN_TYPES: readonly SpanType[] = [
  'form',
  'order',
  'extra',
  'missing',
  'spelling',
  'function',
];

/**
 * Small words that point at `function` rather than `form` when one word faces one word.
 * Norwegian, because that is the language the platform teaches; a wrong preposition and
 * a wrong inflection are different mistakes to a learner and want different explanations.
 */
export const FUNCTION_WORDS: readonly string[] = [
  'i', 'på', 'av', 'for', 'til', 'med', 'om', 'fra', 'hos', 'under', 'over', 'mellom',
  'ved', 'etter', 'før', 'mot', 'en', 'et', 'den', 'det', 'de', 'ei', 'som', 'å', 'og',
  'men', 'eller',
];

/**
 * Presentation and validation only — the model is identical either way.
 * `passage` is one item carrying several mistakes; `sentences` is many items with
 * typically one each.
 */
export type Mode = 'sentences' | 'passage';

/**
 * `${wFrom}:${wTo}:${fix}` — derived from the span, never stored as an id.
 *
 * Deliberate: edit the sentence and the override disappears with the span it belonged
 * to. An explanation attached to a mistake that no longer exists is worse than no
 * explanation.
 */
export type SpanKey = string;

/** What the author overrides on a derived span. Every field is optional by design. */
export interface SpanOverride {
  type?: SpanType;
  note?: string;
  /** Both forms are accepted. A soft span is not a mistake and is counted nowhere. */
  soft?: boolean;
}

export interface Item {
  /** Stable, generated client-side. */
  id: string;
  /** The sentence the student meets. */
  wrong: string;
  /**
   * The answer key. May carry variants: `"Jeg (liker|elsker) det"` expands to two
   * acceptable sentences, `"(nå|)"` makes the word optional.
   */
  ref: string;
  /** Other whole sentences that are accepted. Same variant syntax as `ref`. */
  alts: string[];
  /** Author overrides on derived spans. */
  meta: Record<SpanKey, SpanOverride>;
  /** The student may open it, when `hints.hintText` allows. */
  hint?: string;
  /** Only ever shown in the teacher queue. */
  teacherNote?: string;
}

/** A derived mistake. Never persisted — recomputed from `wrong` against `ref`. */
export interface Span {
  /** Position among the item's spans, in sentence order. */
  index: number;
  /** Into `words(item.wrong)`. `wFrom === wTo` means "insert here". */
  wFrom: number;
  wTo: number;
  /** Into the words of the first accepted variant. */
  rFrom: number;
  rTo: number;
  /** The faulty words, joined. Empty when a word is missing. */
  wrong: string;
  /** What the answer key has instead. Empty when a word is superfluous. */
  fix: string;
  type: SpanType;
  note: string;
  soft: boolean;
  key: SpanKey;
}

/**
 * The student's answer: edits, not text.
 *
 * `marked` — the word was tapped. `fix` — what it was replaced with; `""` means struck
 * out. `ins` — a word inserted at slot `0..n`, between words. `build()` assembles them.
 */
export interface StudentEdits {
  marked: Record<number, boolean>;
  fix: Record<number, string>;
  ins: Record<number, string>;
}

export const EMPTY_EDITS: StudentEdits = { marked: {}, fix: {}, ins: {} };

/** What the student is told before answering. */
export interface Hints {
  /** "3 mistakes in this text". Without it the task is guesswork. */
  count: boolean;
  /** Mark which sentences carry a mistake (passage mode). */
  mark: boolean;
  /** The author's per-item hint can be opened. */
  hintText: boolean;
  /** Name the type of each remaining mistake. */
  showType: boolean;
}

/** What happens to a student's edit that is outside every span. */
export type StrayPolicy = 'ignore' | 'flag' | 'block';

/** What the machine accepts. */
export interface Check {
  on: boolean;
  /** Off by default: a capital letter is often the mistake itself. */
  caseInsensitive: boolean;
  /** Off by default: punctuation is often the mistake itself. */
  ignorePunct: boolean;
  /** One letter's difference in a word of 4+ characters counts as a hit. */
  typo: boolean;
  /** Similarity from which an answer with no fixed span is still called `partial`. */
  near: number;
  /** A full hit on the answer key passes without a teacher. */
  exactPass: boolean;
  strayEdits: StrayPolicy;
  /** Every mistake must have been touched for an automatic pass. */
  requireAllSpans: boolean;
}

export type AttemptsPolicy = 'free' | 'once';
export type ShowRefsPolicy = 'afterGraded' | 'afterSubmit' | 'never';

/** How the exercise is run. */
export interface Flow {
  /** Self-checks allowed before submitting, 0–3. */
  selfCheck: number;
  attempts: AttemptsPolicy;
  showRefs: ShowRefsPolicy;
  /** Offer æ ø å. */
  keyboard: boolean;
  /** Check each sentence on its own. Not built — see plan 41, "Отложено". */
  perSentence: boolean;
  /** Show "2 of 3 fixed" in the self-check. */
  showSpanCount: boolean;
}

export type AiVisibility = 'teacher' | 'studentBefore' | 'studentAfter';

/**
 * The AI stage. Carried from the first commit so that connecting a model later needs no
 * migration — exactly the reason `word_bank_gap_fill` has stored `origin: 'ai_draft'`
 * since its first commit. Nothing here triggers a model call, and the handoff requires
 * every AI surface to stay inert until one is genuinely wired up.
 */
export interface Ai {
  on: boolean;
  checks: { explainWhy: boolean; altFixes: boolean; register: boolean };
  visibility: AiVisibility;
}

export const DEFAULT_HINTS: Hints = {
  count: true,
  mark: false,
  hintText: true,
  showType: false,
};

export const DEFAULT_CHECK: Check = {
  on: true,
  caseInsensitive: false,
  ignorePunct: false,
  typo: true,
  near: 0.85,
  exactPass: true,
  strayEdits: 'flag',
  requireAllSpans: true,
};

export const DEFAULT_FLOW: Flow = {
  selfCheck: 2,
  attempts: 'free',
  showRefs: 'afterGraded',
  keyboard: true,
  perSentence: false,
  showSpanCount: true,
};

export const DEFAULT_AI: Ai = {
  on: true,
  checks: { explainWhy: true, altFixes: true, register: false },
  visibility: 'studentBefore',
};

/**
 * The task itself. Separated from the full document because it is close to what the
 * `content` column holds — see persistence.ts, which lifts the answer key out of `items`.
 */
export interface ErrorCorrectionTask {
  mode: Mode;
  /** Optional context, shown under the instruction. */
  note: string;
  items: Item[];
  hints: Hints;
  check: Check;
  flow: Flow;
  ai: Ai;
}

export interface ErrorCorrection extends ErrorCorrectionTask {
  id: string;
  type: 'error_correction';
  moduleId: string;
  /** Teachers and the module list only. */
  title: string;
  /** The one line the student reads first. */
  instructions: string;
  /** ISO. Doubles as the autosave concurrency token. */
  updatedAt: string;
}

/** How well the submitted sentence matched. The ladder is ordered best to worst. */
export type Verdict = 'exact' | 'typo' | 'partial' | 'stray' | 'off' | 'empty' | 'noref';

/** Where a judged answer goes. The auto-check can only ever pass. */
export type Routing = 'pass' | 'teacher';

/** One word-level operation from aligning two sentences. */
export interface AlignOp {
  t: 'eq' | 'extra' | 'missing';
  /** The word from side A (`eq`, `extra`) or side B (`missing`). */
  w: string;
  /** The answer key's word on an `eq` op. */
  ref?: string;
  /** Index into side A. */
  ai: number;
  /** Index into side B. */
  bi: number;
  /** On an `eq` op whose words were close enough but not identical: the key's spelling. */
  typo: string | null;
}

export interface Alignment {
  ops: AlignOp[];
  /** `2·LCS / (|a| + |b|)`. 1.0 is identical. */
  sim: number;
  edits: number;
}

/** `fixed` — touched and locally equal to the key. `attempted` — touched, not there. */
export type SpanOutcome = 'fixed' | 'attempted' | 'missed';

export interface SpanState extends Span {
  touched: boolean;
  hit: boolean;
  /** What the student's edits produced across this span alone. */
  localFix: string;
  state: SpanOutcome;
}

/** An edit outside every span. `index` is a word index, or a slot for an insert. */
export interface StrayEdit {
  kind: 'edit' | 'insert';
  index: number;
  word: string;
}

export interface Judgement {
  verdict: Verdict;
  sim: number;
  ops: AlignOp[];
  /** The variant the answer was closest to. */
  ref: string;
  spans: SpanState[];
  fixedCount: number;
  /** Hard spans only — `soft` ones are counted nowhere the student can see. */
  spanCount: number;
  /** The sentence the student's edits produced. */
  built: string;
  stray: StrayEdit[];
  exact: boolean;
}

/** Authoring coverage, for the builder's step-2 numbers. */
export interface Coverage {
  /** Items with a `wrong` sentence. */
  items: number;
  /** Hard spans across all items. */
  errors: number;
  byType: Partial<Record<SpanType, number>>;
  /** Items that have an answer key. */
  withRef: number;
  /** Hard spans carrying an author explanation. */
  explained: number;
  /** Items accepting more than one variant. */
  multiVariant: number;
  /** Items with exactly one hard span. */
  singleError: number;
}
