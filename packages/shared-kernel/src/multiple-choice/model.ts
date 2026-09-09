// Model for the `multiple_choice` exercise.
//
// Source of truth: docs/design/activity-specs/design_handoff_multiple_choice/README.md
// in ssz-platform-web, as amended by the decisions in docs/plan/53-multiple-choice.md.
//
// The governing change this model records: `multiple_choice` stops being one question
// with one check and becomes a **set** of questions answered one at a time, each with a
// rule behind the right answer (`why`) and a rebuttal behind every wrong one
// (`Option.why`). Everything else in the handoff — the attempt budget, the 50/50, the
// instant check — is settings over that set, never per-question state.
//
// Field names are camelCase (plan 34 §7). The old snake_case single-question form is
// not migrated, it is *recognised*: `isMultipleChoiceDocument` in persistence.ts.

/**
 * What the question is about.
 *
 * The handoff is explicit that `kind` "carries no scoring logic" — it decides whether a
 * passage is offered and expected, and nothing else. `listening` keeps its passage
 * author-side for the same reason `short_answer` does: it is the transcript of what the
 * audio says, so showing it answers the question (plan 53 §3.8).
 */
export type QuestionKind = 'grammar' | 'vocab' | 'reading' | 'listening';

export interface KindConfig {
  id: QuestionKind;
  /** The author is expected to write a passage; a missing one is a warning. */
  needsPassage: boolean;
  /** Whether the student is shown the passage at all. */
  showsPassage: boolean;
}

export const KINDS: readonly KindConfig[] = [
  { id: 'grammar', needsPassage: false, showsPassage: true },
  { id: 'vocab', needsPassage: false, showsPassage: true },
  { id: 'reading', needsPassage: true, showsPassage: true },
  { id: 'listening', needsPassage: false, showsPassage: false },
];

export function kindConfig(kind: QuestionKind): KindConfig {
  return KINDS.find((k) => k.id === kind) ?? KINDS[0]!;
}

export interface Option {
  id: string;
  text: string;
  /** Exactly one option per question is true — enforced by `setKey` in the editor. */
  correct: boolean;
  /** The rebuttal shown when *this* option is picked. Optional, and the point of step 4. */
  why: string;
  /** Pinned to the bottom, never shuffled — "Alle over", "Ingen av disse". */
  fixed: boolean;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  /** The passage above the stem. Empty for most questions. */
  context: string;
  /** The question itself; `___` marks a gap inside a sentence. */
  stem: string;
  /** 2-8 options. Empty ones are persisted as authored and dropped for the student. */
  options: Option[];
  /** The rule behind the right answer. Required — a missing one is a blocker. */
  why: string;
}

/** How many attempts a question gets. */
export type RetryPolicy = 'none' | 'one' | 'unlimited';

/** Option layout on wide screens; a phone is always a list. */
export type Layout = 'list' | 'grid';

/** Settings are exercise-wide; the handoff has no per-question overrides. */
export interface Settings {
  /** A/B/C badges vs. radio bullets. */
  letters: boolean;
  layout: Layout;
  /** Shuffle the options. Applied server-side, per attempt (plan 53 §3.4). */
  shuffle: boolean;
  shuffleQuestions: boolean;
  /** Judge on tap, with no `Sjekk` button. */
  instant: boolean;
  retry: RetryPolicy;
  /** 50/50: on a wrong pick with attempts left, dim all but one wrong option. */
  eliminate: boolean;
  /** Show `Option.why` after a wrong pick. */
  showWhyWrong: boolean;
  /** Show `Question.why` after a correct pick. */
  explainOnCorrect: boolean;
  progress: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  letters: true,
  layout: 'list',
  shuffle: true,
  shuffleQuestions: false,
  instant: false,
  retry: 'one',
  eliminate: false,
  showWhyWrong: true,
  explainOnCorrect: true,
  progress: true,
};

/** The whole document, as the builder edits it. */
export interface MultipleChoiceContent {
  /** Teacher-facing name of the set. */
  title: string;
  /** One line, shown above every question in the runner. */
  instruction: string;
  questions: Question[];
  settings: Settings;
}

export function newOption(text = '', correct = false, why = '', fixed = false): Option {
  return { id: newId(), text, correct, why, fixed };
}

export function newQuestion(kind: QuestionKind = 'grammar'): Question {
  return {
    id: newId(),
    kind,
    context: '',
    stem: '',
    options: [newOption(), newOption(), newOption()],
    why: '',
  };
}

/**
 * A blank document.
 *
 * The handoff seeds `instruction` with «Velg det riktige svaret.»; this returns an empty
 * string instead (plan 53 §3.6, deviation carried from plan 51). The instruction is
 * authored content on a four-language platform, and a Norwegian literal in the kernel
 * would reach a Ukrainian school. The builder's scaffold fills it from the author's own
 * locale.
 */
export function emptyContent(): MultipleChoiceContent {
  return {
    title: '',
    instruction: '',
    questions: [newQuestion()],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** The attempt budget behind `settings.retry` — README "Attempt budget", verbatim. */
export function maxAttempts(settings: Settings): number {
  if (settings.retry === 'none') return 1;
  if (settings.retry === 'one') return 2;
  return 99;
}

/** Deep copy with fresh ids on the question *and* every option — BEHAVIOR, step 1. */
export function duplicateQuestion(q: Question): Question {
  return {
    ...q,
    id: newId(),
    options: q.options.map((o) => ({ ...o, id: newId() })),
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}
