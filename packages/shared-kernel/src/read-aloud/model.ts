// Model for the `read_aloud` exercise — speech, recorded and graded by a person (plan 70).
//
// Source of truth: docs/design/activity-specs/05_design_handoff_read_aloud/ in ssz-platform-web
// (README → DECISIONS), as amended by docs/plan/70-read-aloud.md.
//
// Three rules hold the whole type together:
//
//   1. **One type, three tasks.** `read` (a known passage aloud), `monologue` (from a picture or a
//      plan) and `dialogue` (a turn in a conversation) share the model, the rubric, the recorder,
//      the upload and the queue. The mode decides only which material a prompt carries and what
//      the runner shows while the microphone is open — the reason `picture` is a mode of
//      `writing_task` rather than a type of its own.
//   2. **A prompt is an element.** One exercise holds 1–6 prompts, each with a stable `id`, its own
//      recording, its own block in the queue and its own verdict. Three prompts are three verdicts,
//      never one averaged mark (README idea 1).
//   3. **The machine never returns the verdict.** Nothing here scores speech; a person marks every
//      recording against the rubric, and the listening note is what makes two people mark alike.
//
// Material of every mode is kept on each prompt — switching the mode does not erase what the
// author wrote for another one. Everything that reads the document (issues, projection, axes)
// reads the fields of the current mode only.

/** A short stable id for a prompt, a point, a focus word or a criterion — the prototype's `RA_ID`. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type Mode = 'read' | 'monologue' | 'dialogue';

/** What material a mode needs on a prompt — read by step 1 of the builder and by `issues.ts`. */
export type ModeNeeds = 'text' | 'support' | 'turn';

/**
 * How the learner knows what they say (plan 63 §2 E; the handoff's `retrieval`, folded into
 * `modality` by decision G of plan 64). Reading aloud pulls the sound of a known word out of
 * memory — `recall`; the other two choose the words — `production` (DECISIONS §5).
 */
export type ModeModality = 'recall' | 'production';

export interface ModeConfig {
  id: Mode;
  needs: ModeNeeds;
  modality: ModeModality;
}

export const MODES: readonly ModeConfig[] = [
  { id: 'read', needs: 'text', modality: 'recall' },
  { id: 'monologue', needs: 'support', modality: 'production' },
  { id: 'dialogue', needs: 'turn', modality: 'production' },
];

export function modeConfig(mode: Mode): ModeConfig {
  return MODES.find((m) => m.id === mode) ?? MODES[0]!;
}

export function isMode(value: unknown): value is Mode {
  return value === 'read' || value === 'monologue' || value === 'dialogue';
}

/** Per-mode recording defaults, seconds (DECISIONS §7). Selecting a mode resets all prompts to these. */
export const LEN: Readonly<Record<Mode, { min: number; max: number; prep: number }>> = {
  read: { min: 15, max: 60, prep: 20 },
  monologue: { min: 40, max: 120, prep: 45 },
  dialogue: { min: 8, max: 40, prep: 10 },
};

export const RA_MAX_PROMPTS = 6;
/** Above this many prompts the sitting is long and the whole set lands in the queue at once. */
export const RA_MANY_PROMPTS = 4;
export const RA_MIN_CRITERIA = 2;
export const RA_MAX_CRITERIA = 5;
export const RA_MAX_TAKES = 3;
export const RA_MAX_PREP_SECONDS = 120;
/** Above ~90 words a reading tests stamina, not pronunciation. */
export const RA_LONG_TEXT_WORDS = 90;
/** Above five points a monologue becomes a list read aloud. */
export const RA_LONG_PLAN_POINTS = 5;

/** A word the grader listens for. Teacher-facing: reaches the student only in the feedback. */
export interface FocusWord {
  id: string;
  word: string;
  note: string;
}

export interface PlanPoint {
  id: string;
  text: string;
  /** «må dekkes» against «valgfritt». */
  required: boolean;
}

export interface PromptImage {
  /** Resolved via the media picker; empty until an asset is chosen. */
  assetId: string;
  caption: string;
  alt: string;
}

export interface Turn {
  /** One line of context: who is talking, where. */
  situation: string;
  /** The line the student answers. */
  partner: string;
}

export interface Prompt {
  id: string;
  label: string;
  /** `read` — the passage. */
  text: string;
  /** `read` — the words being graded. Key side. */
  focus: FocusWord[];
  /** `monologue` — the picture. */
  image: PromptImage;
  /** `monologue` — the plan the student sees beside the microphone. */
  plan: PlanPoint[];
  /** `dialogue` — the situation and the partner's line. */
  turn: Turn;
  /** What a good answer sounds like here. Key side, and a blocker when empty (README idea 2). */
  note: string;
  minSeconds: number;
  maxSeconds: number;
  prepSeconds: number;
}

export type CriterionWeight = 1 | 2;

export interface Criterion {
  id: string;
  name: string;
  /** What the criterion is about, teacher-facing. */
  desc: string;
  weight: CriterionWeight;
  /** Descriptors for levels 0, 1, 2, 3, in that order. Key side. */
  levels: readonly [string, string, string, string];
  /** Whether the learner sees this line of the rubric (DECISIONS §3). */
  studentVisible: boolean;
}

export interface Recording {
  /** 1–3 attempts at the microphone per prompt (DECISIONS §1). */
  takes: number;
  /** The student submits the take they chose; off — the last take is sent. */
  chooseBest: boolean;
  /** The student may hear a take before submitting (DECISIONS §2). */
  listenBack: boolean;
  /** 3 · 2 · 1 before the microphone opens, so the first word is not cut off. */
  countdown: boolean;
  /** A level check before the first prompt. */
  micCheck: boolean;
  /** The discarded takes reach the teacher too. */
  keepAllTakes: boolean;
}

export type ShowRubricPolicy = 'always' | 'afterGraded' | 'never';
export type ShowModelPolicy = 'afterGraded' | 'never';
export type RevisionPolicy = 'once' | 'return';

export interface Settings {
  /** Points a recording needs, out of `Σ 3 × weight` — per prompt (plan 70, Q1-A). */
  passScore: number;
  showRubric: ShowRubricPolicy;
  showModel: ShowModelPolicy;
  revision: RevisionPolicy;
}

export type AiVisibility = 'teacher' | 'studentAfter';

/**
 * The AI stage — designed, switchable, calls nothing (DECISIONS §4, plan 48). Carried so that
 * connecting a model later needs no migration, as in `writing_task`.
 */
export interface Review {
  aiStage: boolean;
  ai: { transcript: boolean; pronunciation: boolean; fluency: boolean; draft: boolean };
  aiVisibility: AiVisibility;
}

export interface ReadAloudContent {
  title: string;
  /** One line, in the course language. The recording rules are the runner's to state. */
  instruction: string;
  /** The course language — the default rubric is chosen by it (plan 70, deviation 27). */
  language: string;
  mode: Mode;
  prompts: Prompt[];
  rubric: Criterion[];
  recording: Recording;
  settings: Settings;
  review: Review;
}

export const DEFAULT_RECORDING: Recording = {
  takes: 3,
  chooseBest: true,
  listenBack: true,
  countdown: true,
  micCheck: true,
  keepAllTakes: false,
};

export const DEFAULT_SETTINGS: Settings = {
  passScore: 9,
  showRubric: 'afterGraded',
  showModel: 'afterGraded',
  revision: 'return',
};

export const DEFAULT_REVIEW: Review = {
  aiStage: false,
  ai: { transcript: true, pronunciation: true, fluency: false, draft: false },
  aiVisibility: 'teacher',
};

export const SHOW_RUBRIC: readonly ShowRubricPolicy[] = ['always', 'afterGraded', 'never'];
export const SHOW_MODEL: readonly ShowModelPolicy[] = ['afterGraded', 'never'];
export const REVISIONS: readonly RevisionPolicy[] = ['once', 'return'];
export const AI_VISIBILITIES: readonly AiVisibility[] = ['teacher', 'studentAfter'];

export function newPrompt(mode: Mode): Prompt {
  const len = LEN[mode];
  return {
    id: newId(),
    label: '',
    text: '',
    focus: [],
    image: { assetId: '', caption: '', alt: '' },
    plan: [],
    turn: { situation: '', partner: '' },
    note: '',
    minSeconds: len.min,
    maxSeconds: len.max,
    prepSeconds: len.prep,
  };
}

type Levels = readonly [string, string, string, string];

interface DefaultCriterion {
  id: string;
  weight: CriterionWeight;
  name: string;
  desc: string;
  levels: Levels;
}

/**
 * The working default of DECISIONS §3 — `Uttale` ×2, `Flyt` ×1, `Innhold` ×2, fifteen points —
 * as content of the course language. The words are content, not constants (README «Language»):
 * a course in a language with no default gets the three criteria with their weights and empty
 * wording, which the author fills in (a blocker until named).
 */
const DEFAULT_RUBRICS: Readonly<Record<string, readonly DefaultCriterion[]>> = {
  nb: [
    {
      id: 'pron',
      weight: 2,
      name: 'Uttale',
      desc: 'Lyder, trykk og tonefall. Blir ordene forstått?',
      levels: [
        'Vanskelig å forstå.',
        'Forstås med anstrengelse; gjennomgående feil i kjente lyder.',
        'Forstås lett; enkelte lyder eller trykk sitter ikke.',
        'Tydelig og trygg uttale; trykk og tonefall stemmer.',
      ],
    },
    {
      id: 'flow',
      weight: 1,
      name: 'Flyt',
      desc: 'Tempo, pauser, nøling og selvretting.',
      levels: [
        'Stopper opp så ofte at innholdet forsvinner.',
        'Mange pauser midt i setninger.',
        'Jevnt tempo med noen nølinger.',
        'Naturlig tempo og pauser på riktig sted.',
      ],
    },
    {
      id: 'content',
      weight: 2,
      name: 'Innhold',
      desc: 'Dekker oppgaven: punktene, situasjonen, lengden.',
      levels: [
        'Svarer ikke på oppgaven.',
        'Dekker ett punkt.',
        'Dekker det meste; ett punkt mangler.',
        'Dekker alle punktene med egne ord.',
      ],
    },
  ],
};

const BARE_RUBRIC: readonly DefaultCriterion[] = [
  { id: 'pron', weight: 2, name: '', desc: '', levels: ['', '', '', ''] },
  { id: 'flow', weight: 1, name: '', desc: '', levels: ['', '', '', ''] },
  { id: 'content', weight: 2, name: '', desc: '', levels: ['', '', '', ''] },
];

export function defaultRubric(language: string): Criterion[] {
  const base = DEFAULT_RUBRICS[language] ?? BARE_RUBRIC;
  return base.map((c) => ({ ...c, levels: [...c.levels] as unknown as Levels, studentVisible: true }));
}

export function newCriterion(): Criterion {
  return { id: newId(), name: '', desc: '', weight: 1, levels: ['', '', '', ''], studentVisible: true };
}

/** A blank document for a course language: one empty `read` prompt and the default rubric. */
export function emptyContent(language = ''): ReadAloudContent {
  return {
    title: '',
    instruction: '',
    language,
    mode: 'read',
    prompts: [newPrompt('read')],
    rubric: defaultRubric(language),
    recording: { ...DEFAULT_RECORDING },
    settings: { ...DEFAULT_SETTINGS },
    review: { ...DEFAULT_REVIEW, ai: { ...DEFAULT_REVIEW.ai } },
  };
}
