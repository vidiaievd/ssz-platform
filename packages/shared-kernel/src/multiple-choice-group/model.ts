// Model for the `multiple_choice_group` exercise.
//
// Source of truth: docs/design/activity-specs/design_handoff_multiple_choice_group/README.md
// in ssz-platform-web, as amended by the decisions in docs/plan/54-multiple-choice-group.md.
//
// What separates this type from `multiple_choice`, and the reason plan 53 §3.7 refused to
// merge them: **the unit of work is the group.** A table of statements shares one set of
// answer columns, the student answers every row, and the whole table is handed in at once.
// In `multiple_choice` a question is the unit — it carries its own options, its own attempt
// budget and its own 50/50. Here none of those are per-row: the columns are the table's,
// the attempt budget is the table's, and there is no 50/50 at all.
//
// Field names are camelCase (plan 34 §7). The old snake_case form (`content.items[]` with
// `expected_answers.items[]`) is not migrated, it is *recognised*:
// `isMultipleChoiceGroupDocument` in persistence.ts.

/**
 * One answer column, shared by every row.
 *
 * `short` is the 1-3 character code — «R», «G», «?» — and exists for exactly two callers:
 * bulk paste, which resolves a trailing `| R` against it, and CSV export. It is never the
 * thing a student reads; the table header shows `label`.
 */
export interface Column {
  id: string;
  label: string;
  short: string;
}

/**
 * One statement.
 *
 * `answer` is a column id and is the key — so it does not live in the content column
 * (persistence.ts). Neither do `why` and `quote`: a quote is the line of the text that
 * proves the answer, which on a Riktig/Galt row is the answer written out.
 */
export interface Row {
  id: string;
  text: string;
  /** The column this statement belongs in. `null` until the author marks it. */
  answer: string | null;
  /** Shown after checking, under `settings.showWhy`. */
  why: string;
  /** A verbatim line from `source.text`, highlighted when the answer is shown. */
  quote: string;
}

/** How the material the statements are about reaches the student. */
export type SourceMode = 'none' | 'inline' | 'link';

export interface Source {
  mode: SourceMode;
  /** The heading above the passage, or the link's label in `link` mode. */
  label: string;
  /** Only meaningful in `inline` mode. */
  text: string;
  /**
   * The lesson «Til teksten» points at, in `link` mode.
   *
   * The prototype models only the label, and IMPLEMENTATION.md flags that as a gap:
   * a link with nothing to link to is a decoration. Plan 54 Q5 decides where the id
   * comes from; the field is here from the start so the shape does not change under a
   * document that is already written.
   */
  lessonId?: string;
}

/** How many times the table may be checked. */
export type RetryPolicy = 'none' | 'one' | 'unlimited';

/** Table on wide screens, or cards everywhere. A phone is always cards. */
export type Layout = 'auto' | 'cards';

/** When the per-row explanation is shown. */
export type ShowWhy = 'never' | 'wrong' | 'always';

/** Settings are exercise-wide; the handoff has no per-row overrides. */
export interface Settings {
  /** 1. 2. 3. in front of each statement. */
  numbering: boolean;
  /** Shuffle statement order per attempt. Applied server-side (plan 54 §3.5). */
  shuffleRows: boolean;
  layout: Layout;
  /** Show the passage with the exercise. */
  showText: boolean;
  /** Retries of the *wrong rows only*. */
  retry: RetryPolicy;
  /** Rows answered correctly freeze on retry. */
  lockCorrect: boolean;
  showWhy: ShowWhy;
  /** Mark the right column once no attempts are left. */
  revealKey: boolean;
  /** Percent of rows needed to pass. Compared with `>=` — never `>`. */
  passThreshold: number;
  /** The "n/total svart" strip while working. */
  progress: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  numbering: true,
  shuffleRows: false,
  layout: 'auto',
  showText: true,
  retry: 'one',
  lockCorrect: true,
  showWhy: 'wrong',
  revealKey: true,
  passThreshold: 70,
  progress: true,
};

/** The whole document, as the builder edits it. */
export interface MultipleChoiceGroupContent {
  /** Teacher-facing name of the table. */
  title: string;
  /** One line, shown above the table in the runner. */
  instruction: string;
  source: Source;
  /** 2-4 columns, shared by every row. */
  columns: Column[];
  rows: Row[];
  settings: Settings;
}

/** The pass mark expressed in rows rather than percent — what step 3 shows the author. */
export function passMark(settings: Settings, totalRows: number): number {
  if (totalRows <= 0) return 0;
  return Math.ceil((settings.passThreshold / 100) * totalRows);
}

/**
 * Column presets — README "Column presets".
 *
 * Labels are Norwegian because the handoff's course is, and unlike the instruction (which
 * `emptyContent` deliberately leaves empty) these are a *starting point the author edits*,
 * offered as four named cards rather than written into the document unasked. A Ukrainian
 * school renames them in the same keystrokes it would take to reject a localised guess.
 */
export interface Preset {
  id: string;
  columns: ReadonlyArray<readonly [label: string, short: string]>;
}

export const PRESETS: readonly Preset[] = [
  { id: 'rg', columns: [['Riktig', 'R'], ['Galt', 'G']] },
  { id: 'rgs', columns: [['Riktig', 'R'], ['Galt', 'G'], ['Står ikke i teksten', '?']] },
  { id: 'jn', columns: [['Ja', 'J'], ['Nei', 'N']] },
  { id: 'su', columns: [['Sant', 'S'], ['Usant', 'U']] },
];

/** The default `short` for a label: its first character, upper-cased. */
export function shortFor(label: string): string {
  return label.trim().slice(0, 1).toUpperCase();
}

export function newColumn(label = '', short?: string): Column {
  return { id: newId(), label, short: short ?? shortFor(label) };
}

export function newRow(): Row {
  return { id: newId(), text: '', answer: null, why: '', quote: '' };
}

/**
 * A blank document: the Riktig/Galt pair and four empty rows, per README "Defaults".
 *
 * The handoff seeds `instruction` with «Les teksten. Er påstandene riktige eller gale?»;
 * this returns an empty string instead (plan 53 §3.6, carried from plan 51). The
 * instruction is authored content on a four-language platform, and a Norwegian literal in
 * the kernel would reach a Ukrainian school. The builder's scaffold fills it from the
 * author's own locale.
 */
export function emptyContent(): MultipleChoiceGroupContent {
  return {
    title: '',
    instruction: '',
    source: { mode: 'none', label: '', text: '' },
    columns: PRESETS[0]!.columns.map(([label, short]) => newColumn(label, short)),
    rows: [newRow(), newRow(), newRow(), newRow()],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * The attempt budget behind `settings.retry` — README "Attempt budget", verbatim.
 *
 * An attempt here is a check of the *whole table*, not of a row: `'one'` means the student
 * may check, see which rows are wrong, fix those, and check again. That is the whole
 * difference from `multiple_choice`, where the budget belongs to a question.
 */
export function maxAttempts(settings: Settings): number {
  if (settings.retry === 'none') return 1;
  if (settings.retry === 'one') return 2;
  return 99;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}
