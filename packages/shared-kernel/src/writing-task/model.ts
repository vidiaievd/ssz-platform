// Model for the `writing_task` exercise.
//
// Source of truth: docs/design/activity-specs/design_handoff_writing_task/README.md
// in ssz-platform-web, as amended by the decisions in docs/plan/50-writing-task.md.
//
// The governing rule: **nothing about the student's text is graded automatically.**
// There is no engine.ts here — a human sets every mark. `analysis.ts` produces facts
// and suggestions only; see its header for why that is not the same thing as grading.

/** Five subtypes sharing one data model, rubric, pipeline and review queue (README
 *  "Why picture is a mode"). `picture` differs from `letter` in exactly one field. */
export type Mode = 'letter' | 'essay' | 'picture' | 'retell' | 'free';

/** What material a mode requires, read by both step 1 of the builder and `issues.ts`. */
export type ModeNeeds = 'letter' | 'image' | 'source' | null;

export interface ModeConfig {
  id: Mode;
  needs: ModeNeeds;
}

export const MODES: readonly ModeConfig[] = [
  { id: 'letter', needs: 'letter' },
  { id: 'essay', needs: null },
  { id: 'picture', needs: 'image' },
  { id: 'retell', needs: 'source' },
  { id: 'free', needs: null },
];

export function modeConfig(mode: Mode): ModeConfig {
  return MODES.find((m) => m.id === mode) ?? MODES[0]!;
}

/** `[minWords, maxWords]` defaults per mode. Selecting a mode resets the pair to this. */
export const LEN_DEFAULTS: Record<Mode, readonly [number, number]> = {
  letter: [120, 200],
  essay: [200, 350],
  picture: [90, 150],
  retell: [120, 200],
  free: [150, 250],
};

/** One thing the text must cover. */
export interface Point {
  id: string;
  /** Shown to the student as a checklist item. */
  text: string;
  /** 2-3 phrasings. Used only by the AI pre-check, never to reject an answer. */
  keywords: string[];
  /** Optional points do not count towards a pass. */
  required: boolean;
}

/**
 * The heuristic key a criterion's mark suggestion is computed from (`analysis.ts`).
 * Explicit rather than positional (plan 50 decision 3) so a reordered or custom
 * rubric still gets sensible suggestions instead of nonsense ones; `null` means the
 * criterion gets no suggestion at all.
 */
export type CriterionMetric = 'points' | 'paragraphs' | 'language' | 'lexis' | null;

export interface Criterion {
  id: string;
  /** e.g. 'Oppgaveløsning'. */
  name: string;
  /** What it is about, teacher-facing. */
  desc: string;
  weight: 1 | 2;
  /** Descriptors for levels 0, 1, 2, 3, in that order. */
  levels: readonly [string, string, string, string];
  metric: CriterionMetric;
}

export type ShowRubricPolicy = 'always' | 'afterGraded' | 'never';
export type ShowModelPolicy = 'afterGraded' | 'never';
export type AiVisibility = 'teacher' | 'studentBefore' | 'studentAfter';
export type AiSelfLimit = 0 | 1 | 2 | 3;
export type RevisionPolicy = 'once' | 'return' | 'drafts';

/**
 * The AI stage. Carried from the first commit so that connecting a model later needs
 * no migration (same reasoning as `error-correction/model.ts`'s `Ai`). Nothing here
 * triggers a model call — see plan 48 for when and how it might.
 */
export interface Ai {
  grammar: boolean;
  task: boolean;
  structure: boolean;
  lexis: boolean;
  /** Pre-fills the review queue's rubric rows when the stage is on. */
  draft: boolean;
}

export interface Settings {
  /** 0 means no minimum; submit is never length-gated on it. */
  minWords: number;
  /** 0 means no ceiling. */
  maxWords: number;
  /** Minutes, 0 = off. Counts down from the first keystroke. */
  timer: number;
  blockPaste: boolean;
  autosave: boolean;
  showWordCount: boolean;
  /** Must-cover points as a student checklist. */
  showPlan: boolean;
  /** Useful-phrases chips. */
  showPhrases: boolean;
  showRubric: ShowRubricPolicy;
  showModel: ShowModelPolicy;
  /** Points needed to pass, out of `wtMax(ex)`. */
  passScore: number;
  /** Display switch only — nothing calls a model in this build. */
  aiStage: boolean;
  ai: Ai;
  aiVisibility: AiVisibility;
  /** Student-run language checks, when `aiVisibility === 'studentBefore'`. */
  aiSelfLimit: AiSelfLimit;
  revision: RevisionPolicy;
}

export const DEFAULT_AI: Ai = { grammar: true, task: true, structure: true, lexis: true, draft: true };

export const DEFAULT_SETTINGS: Settings = {
  minWords: 120,
  maxWords: 200,
  timer: 0,
  blockPaste: true,
  autosave: true,
  showWordCount: true,
  showPlan: true,
  showPhrases: true,
  showRubric: 'afterGraded',
  showModel: 'afterGraded',
  passScore: 8,
  aiStage: true,
  ai: { ...DEFAULT_AI },
  aiVisibility: 'studentBefore',
  aiSelfLimit: 2,
  revision: 'return',
};

export function defaultRubric(): Criterion[] {
  return [
    criterion(
      'Oppgaveløsning',
      'Er alle punktene i oppgaven dekket, og holder teksten seg til temaet?',
      2,
      [
        'Svarer ikke på oppgaven',
        'Ett punkt er dekket',
        'De fleste punktene er dekket',
        'Alle punktene er dekket og utdypet',
      ],
      'points',
    ),
    criterion(
      'Struktur og sammenheng',
      'Innledning, hoveddel og avslutning; bindeord mellom avsnittene.',
      1,
      ['Ingen struktur', 'Løse setninger uten avsnitt', 'Avsnitt, men få bindeord', 'Tydelig struktur og god flyt'],
      'paragraphs',
    ),
    criterion(
      'Språk og grammatikk',
      'Setningsbygning, verbtider, samsvar.',
      1,
      ['Vanskelig å forstå', 'Mange feil, men forståelig', 'Noen feil som ikke forstyrrer', 'Få feil, trygg setningsbygning'],
      'language',
    ),
    criterion(
      'Ordforråd og rettskriving',
      'Variasjon i ord og kontroll på skrivemåten.',
      1,
      ['Svært begrenset', 'Enkelt og gjentakende', 'Passende for nivået', 'Variert og presist'],
      'lexis',
    ),
  ];
}

function criterion(
  name: string,
  desc: string,
  weight: 1 | 2,
  levels: readonly [string, string, string, string],
  metric: CriterionMetric,
): Criterion {
  return { id: newId(), name, desc, weight, levels, metric };
}

export function newPoint(text = '', keywords: string[] = [], required = true): Point {
  return { id: newId(), text, keywords, required };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export interface Image {
  /** Resolved via the media picker; absent until an asset is chosen. */
  assetId?: string;
  caption: string;
  alt: string;
}

export type LetterRegister = 'formal' | 'informal';

export interface Letter {
  register: LetterRegister;
  recipient: string;
}

/**
 * The task itself — everything needed to render it and to know what the answers are.
 * Separated from the full document because it is close to what the `content` column
 * holds — see persistence.ts, which lifts the answer key (point keywords, rubric
 * level descriptors, the model answer) out of it.
 */
export interface WritingTaskContent {
  mode: Mode;
  /** One line, student-facing. */
  instruction: string;
  /** Required — the situation, not the checklist. */
  prompt: string;
  /** `retell` only. */
  source: string;
  /** `picture` only. */
  image: Image;
  /** `letter` only. */
  letter: Letter;
  /** 1-6 points, in practice 3-4. */
  points: Point[];
  /** Optional sentence openers offered to the student. */
  phrases: string[];
  /** Example answer. Strongly recommended, not a blocker. */
  model: string;
  /** 2-6 criteria, default 4. */
  rubric: Criterion[];
  settings: Settings;
}

export interface WritingTask extends WritingTaskContent {
  id: string;
  type: 'writing_task';
  moduleId: string;
  title: string;
  /** ISO. Doubles as the autosave concurrency token. */
  updatedAt: string;
}

export function emptyContent(): WritingTaskContent {
  return {
    mode: 'letter',
    instruction: 'Skriv en sammenhengende tekst.',
    prompt: '',
    source: '',
    image: { caption: '', alt: '' },
    letter: { register: 'formal', recipient: '' },
    points: [newPoint()],
    phrases: [],
    model: '',
    rubric: defaultRubric(),
    settings: { ...DEFAULT_SETTINGS, ai: { ...DEFAULT_AI } },
  };
}
