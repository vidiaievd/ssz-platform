// Model for the `information_transfer` exercise — fill in a form from a text or a recording.
//
// Source of truth: docs/design/activity-specs/07_design_handoff_information_transfer/ in
// ssz-platform-web (README + DECISIONS + the prototype), as amended by
// docs/plan/73-information-transfer.md.
//
// The Norskprøve classic: an announcement is heard or a timetable is read, and a blank with four
// to six labelled cells — a time, a place, a price, a phone number — is filled in. What it trains
// is *selective* comprehension: four facts lifted out of a source that says more. Three ideas
// shape everything here:
//
//   1. **The cell is the element** (DECISIONS §2). Each field has a stable `id`, which is also its
//      `itemKey`; its own verdict, its own explanation, its own row in the report. Reordering the
//      blank never moves an explanation.
//   2. **Formats live in the core, keyed on the field type** (DECISIONS §1). The author writes
//      «17:30» once and types the field *Time*; `kl. 17.30`, `1730` and `halv seks` are then the
//      same answer, because `formats.ts` turns each into the same canonical value. The words for
//      it are language-pack data (`packs/`), never code.
//   3. **One switch moves the input axis**: `sourceKind`. A text to read or a recording to hear —
//      nothing else in the exercise changes between the two. The recording is the shared audio
//      block of plan 56, switched on exactly when `sourceKind` is `audio` (plan 73 §3.1).
//
// Field names are camelCase (plan 34 §7). The handoff's `fieldId` is `id`, `instructions` is
// `instruction` and `languagePack` is `language` — the course language (plan 73 §5, 3–4).

import type { ExerciseAudio, ItemAudio } from '../audio/model.js';
import { AUDIO_DEFAULT } from '../audio/model.js';

/** Under three cells there is nothing to sift — the exercise stops being selective (README). */
export const MIN_FIELDS = 3;

/** Over eight the student is transcribing the source instead of picking facts out of it. */
export const MAX_FIELDS = 8;

export type SourceKind = 'text' | 'audio';
export const SOURCE_KINDS: readonly SourceKind[] = ['text', 'audio'];

/** What the exercise is credited as training (step 1). The two values the handoff allows. */
export type InfFocus = 'pragmatics' | 'vocabulary';
export const FOCUSES: readonly InfFocus[] = ['pragmatics', 'vocabulary'];

/** `form` — labels beside the cells; `table` — labels above. */
export type Layout = 'form' | 'table';
export const LAYOUTS: readonly Layout[] = ['form', 'table'];

/**
 * The kind of answer a cell takes. The five format types each own a normaliser; the two lexical
 * ones are compared as normalised text (DECISIONS §1, the table).
 */
export type FieldType = 'time' | 'date' | 'number' | 'money' | 'phone' | 'name' | 'word';
export const FIELD_TYPES: readonly FieldType[] = [
  'time',
  'date',
  'number',
  'money',
  'phone',
  'name',
  'word',
];

export const FORMAT_TYPES: readonly FieldType[] = ['time', 'date', 'number', 'money', 'phone'];

/** A time, a date, an amount, a phone number — read by a normaliser, never forgiven a typo. */
export function isFormatType(type: FieldType): boolean {
  return FORMAT_TYPES.includes(type);
}

/** A name or a word — the only cells that can carry a word atom (DECISIONS §4). */
export function isLexicalType(type: FieldType): boolean {
  return type === 'name' || type === 'word';
}

export interface Field {
  /** Stable, and the `itemKey` of the cell (README: «`itemKey = fieldId`»). */
  id: string;
  /** Printed beside or above the cell: «Klokkeslett». */
  label: string;
  /** Printed on the form under the label: «dag og måned». When — `hintsAfter`. */
  hint: string;
  type: FieldType;
  /** A suffix after the input: «kr». */
  unit: string;
  /** A required cell can be made to matter on its own (`grading.requiredAll`). */
  required: boolean;
  /** The cell's fragment of the clip — the audio layer's per-item timecode. */
  audio: ItemAudio | null;
  /**
   * The answer, and any extra wordings — for the lexical cases only (an abbreviation, a short
   * form of a name). Formats are not listed here: the core reads them (DECISIONS §1). Lives in
   * `expected_answers`.
   */
  expected: string[];
  /** Why this is the answer — usually about the trap. A blocker when missing (DECISIONS §3). */
  why: string;
}

export interface Form {
  /** What the student is filling in: «Påmeldingsskjema — norskkurs». */
  formTitle: string;
  layout: Layout;
}

/** What normalisation is allowed to forgive. Grading is per cell, always (DECISIONS §2). */
export interface Grading {
  /** «halv seks» as 17:30, «fire hundre og femti» as 450 — the pack's lexicon. */
  spelledNumbers: boolean;
  /** One character off a lexical answer. Never applies to a number (DECISIONS §1). */
  typos: boolean;
  strictCase: boolean;
  /** Every required cell must be right, on top of the percentage (DECISIONS §2). */
  requiredAll: boolean;
}

export type ShowSource = 'always' | 'afterAnswer';
export const SHOW_SOURCES: readonly ShowSource[] = ['always', 'afterAnswer'];

/** `0` from the start, `1` after one attempt, `9` never — the prototype's own values. */
export type HintsAfter = 0 | 1 | 9;
export const HINTS_AFTER: readonly HintsAfter[] = [0, 1, 9];

export type RevealKey = 'immediately' | 'afterLastAttempt' | 'never';
export const REVEAL_KEYS: readonly RevealKey[] = ['immediately', 'afterLastAttempt', 'never'];

/** Checks of the whole form. `0` is unlimited, as for `sort_into_buckets`. */
export type Attempts = 0 | 1 | 2 | 3;
export const ATTEMPTS: readonly Attempts[] = [1, 2, 3, 0];

/** Difficulty — step 4. Nothing here changes the content (DECISIONS §5). */
export interface Answering {
  /** For a text source. Hiding it is a blocker — a different exercise (DECISIONS §5). */
  showSource: ShowSource;
  /** Walk the cells one by one instead of showing the whole blank. */
  oneAtATime: boolean;
  hintsAfter: HintsAfter;
  /** When the expected value itself is shown. The explanation always comes with the verdict. */
  revealKey: RevealKey;
  attempts: Attempts;
}

/** What the result is allowed to move (DECISIONS §4). */
export type Memory = 'skill' | 'skill+words' | 'none';
export const MEMORIES: readonly Memory[] = ['skill', 'skill+words', 'none'];

export interface Scoring {
  /** Pass mark, percent of cells, compared with `>=`. */
  passPct: number;
  memory: Memory;
  /** An exposure event on the lexical cells — no rating. Not live until plan 63 phase 7. */
  logWordExposure: boolean;
}

/** The whole document, as the builder edits it. */
export interface InformationTransferContent {
  title: string;
  /** One line above the source, in the target language. */
  instruction: string;
  /** The course language — the pack is chosen by it (DECISIONS §1). */
  language: string;
  sourceKind: SourceKind;
  focus: InfFocus;
  /** For a text source: what the student is looking at — a timetable, a notice. */
  passageTitle: string;
  passage: string;
  /** The shared audio block. `enabled` follows `sourceKind` on write (plan 73 §3.1). */
  audio: ExerciseAudio;
  form: Form;
  fields: Field[];
  grading: Grading;
  answering: Answering;
  scoring: Scoring;
}

export const DEFAULT_FORM: Form = { formTitle: '', layout: 'form' };

export const DEFAULT_GRADING: Grading = {
  spelledNumbers: true,
  typos: false,
  strictCase: false,
  requiredAll: false,
};

export const DEFAULT_ANSWERING: Answering = {
  showSource: 'always',
  oneAtATime: false,
  hintsAfter: 1,
  revealKey: 'afterLastAttempt',
  attempts: 2,
};

export const DEFAULT_SCORING: Scoring = { passPct: 75, memory: 'skill', logWordExposure: true };

export function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** `infField` of the prototype: a required cell with one empty expected wording. */
export function newField(label = '', type: FieldType = 'word'): Field {
  return {
    id: newId(),
    label,
    hint: '',
    type,
    unit: '',
    required: true,
    audio: null,
    expected: [''],
    why: '',
  };
}

export function emptyAudio(): ExerciseAudio {
  return { ...AUDIO_DEFAULT, settings: { ...AUDIO_DEFAULT.settings } };
}

/**
 * A blank document for a course language (`INF_EMPTY`): a text source and one empty field. No
 * Norwegian is written into it — the pack offers its placeholders to the builder instead.
 */
export function emptyContent(language = ''): InformationTransferContent {
  return {
    title: '',
    instruction: '',
    language,
    sourceKind: 'text',
    focus: 'pragmatics',
    passageTitle: '',
    passage: '',
    audio: emptyAudio(),
    form: { ...DEFAULT_FORM },
    fields: [newField('', 'word')],
    grading: { ...DEFAULT_GRADING },
    answering: { ...DEFAULT_ANSWERING },
    scoring: { ...DEFAULT_SCORING },
  };
}

/** Checks of the form, or `null` for unlimited. A graded delivery allows one (Q8-A of plan 67). */
export function maxChecks(answering: Answering, graded = false): number | null {
  if (graded) return 1;
  return answering.attempts === 0 ? null : answering.attempts;
}
