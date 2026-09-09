// Model for the `short_answer` exercise.
//
// Source of truth: docs/design/activity-specs/design_handoff_short_answer/README.md
// in ssz-platform-web, as amended by the decisions in docs/plan/51-short-answer.md.
//
// The governing idea: a free answer cannot be compared to a string, so the answer key
// is **semantic elements**. Each element is one thing the answer has to say, carrying
// two or three anchor phrases a student might say it with. An element is covered when
// any one of its anchors appears in the answer as a contiguous run of words.
//
// The verdict follows from element coverage, never from a single similarity score —
// see grading.ts, whose header explains why that distinction is the whole feature.

/** What the question is about. Controls the passage field only — never the grading. */
export type QuestionKind = 'reading' | 'listening' | 'opinion';

/** Whether a passage belongs to this kind, and whether the student is shown it. */
export interface KindConfig {
  id: QuestionKind;
  /** The author is expected to write one; a missing passage is a warning. */
  needsPassage: boolean;
  /** `listening` keeps the transcript author-side: it is what the audio says. */
  showsPassage: boolean;
}

export const KINDS: readonly KindConfig[] = [
  { id: 'reading', needsPassage: true, showsPassage: true },
  { id: 'listening', needsPassage: false, showsPassage: false },
  { id: 'opinion', needsPassage: false, showsPassage: false },
];

export function kindConfig(kind: QuestionKind): KindConfig {
  return KINDS.find((k) => k.id === kind) ?? KINDS[0]!;
}

/**
 * Where a graded question goes: closed by the check, or to a person.
 *
 * The same two words `translate` and `error_correction` use, and deliberately so — the
 * queue, `isMachineClean` and the batch approval all read this field across every
 * template, and a third vocabulary here would read as "no item was ever auto-passed".
 */
export type Routing = 'pass' | 'teacher';

/** One thing the answer must say, and the phrasings that count as saying it. */
export interface KeyElement {
  id: string;
  /** What the answer must say, in the teacher's words. Shown in the breakdown. */
  label: string;
  /** 2-3 phrasings a student might use. Never shown to the student — they are the answer. */
  anchors: string[];
  /** Optional elements are reported in the breakdown but never block a pass. */
  required: boolean;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  /** The text or transcript the question is about; `''` for `opinion`. */
  passage: string;
  /** The question itself. Required. */
  prompt: string;
  /** The answer the author would accept. Required — the key is validated against it. */
  model: string;
  /** 1-5 elements, in practice 2-4. */
  elements: KeyElement[];
  /** Shown under every verdict. Required. */
  why: string;
}

/** How many required elements a pass needs. */
export type PassRule = 'all' | 'n';

/** When the model answer is revealed to the student. */
export type ShowModelPolicy = 'always' | 'onClose' | 'never';

/** Who reads the answers after the phrase match. */
export type TeacherReviewPolicy = 'all' | 'flagged' | 'none';

/**
 * Settings are exercise-wide; the handoff has no per-question overrides
 * (README "Out of scope").
 */
export interface Settings {
  passRule: PassRule;
  /** 1-3, used when `passRule === 'n'`. */
  passN: number;
  /** Tolerate a one-letter slip inside a word longer than three characters. */
  typos: boolean;
  /** Always true: matching is case-insensitive. Carried so the field is not lost. */
  caseless: boolean;
  /** 0 = off. A shorter answer is flagged too short and can never reach `pass`. */
  minWords: number;
  /** Element-by-element result after submitting. */
  showBreakdown: boolean;
  showModel: ShowModelPolicy;
  /**
   * Display switch only — nothing calls a model in this build (plan 51 §3.6).
   * Carried from the first commit so connecting the stage later needs no migration.
   */
  aiStage: boolean;
  /** When the AI stage is on, it also comments on grammar. */
  aiGrammar: boolean;
  teacherReview: TeacherReviewPolicy;
  /** Progress bar and `n/total` in the runner. */
  progress: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  passRule: 'all',
  passN: 2,
  typos: true,
  caseless: true,
  minWords: 3,
  showBreakdown: true,
  showModel: 'onClose',
  aiStage: false,
  aiGrammar: true,
  teacherReview: 'flagged',
  progress: true,
};

/** The whole document, as the builder edits it. */
export interface ShortAnswerContent {
  /** Teacher-facing name of the set. */
  title: string;
  /** One line, shown above every question in the runner. */
  instruction: string;
  questions: Question[];
  settings: Settings;
}

export function newElement(label = '', anchors: string[] = [], required = true): KeyElement {
  return { id: newId(), label, anchors, required };
}

export function newQuestion(kind: QuestionKind = 'reading'): Question {
  return { id: newId(), kind, passage: '', prompt: '', model: '', elements: [newElement()], why: '' };
}

export function emptyContent(): ShortAnswerContent {
  return {
    title: '',
    instruction: '',
    questions: [newQuestion()],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}
