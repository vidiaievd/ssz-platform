// Model for the `highlight_in_text` exercise.
//
// Source of truth: docs/design/activity-specs/02_design_handoff_highlight_in_text/ in
// ssz-platform-web, as amended by docs/plan/67-highlight-in-text.md.
//
// One passage, up to four questions over it, the answers marked in the text. Three ideas
// from the handoff shape everything here:
//
//   1. **A mark is a run of whole tokens.** Stored as character offsets into `text`
//      (`start`, `end` — the first token's start, the last token's end), worked on as token
//      indices; the conversion is coordinates.ts and nowhere else.
//   2. **A mark is never silently lost.** Editing the passage re-anchors every span by its
//      words and their order of occurrence; a span that cannot be found becomes an orphan,
//      and orphans block assignment (reanchor.ts).
//   3. **An extra mark costs something.** `settings.penalty` — without it, marking the whole
//      paragraph scores full marks (grading.ts).
//
// Field names are camelCase (plan 34 §7). The author's focus (grammar / vocabulary) is *not*
// a field: decision Q1-A of plan 66, carried over as deviation 14 of plan 67.

/** More passes over one text turns into a worksheet (DECISIONS §3). */
export const HT_MAX_Q = 4;

/** Under this many words the feature cannot repeat in the passage. */
export const HT_TEXT_SHORT = 25;

/** Over this many words the passage is a long scroll on a phone. */
export const HT_TEXT_LONG = 260;

/** Past this share of the passage, a student who marks everything scores well. */
export const HT_DENSITY_HIGH = 0.4;

/** Under this many marks in a question, one lucky tap passes it. */
export const HT_FEW_SPANS = 3;

/** `word` — one tap marks one token. `phrase` — a drag marks a run (DECISIONS §1). */
export type Unit = 'word' | 'phrase';

export const UNITS: readonly Unit[] = ['word', 'phrase'];

export interface Span {
  /** Stable, generated at creation. Survives re-anchoring and orphaning. */
  id: string;
  /** Character offset of the first token's first character. */
  start: number;
  /** Character offset one past the last token's last character. */
  end: number;
  /** Why this one counts — optional, shown with the key. */
  why: string;
}

export interface Question {
  /** Stable — the `itemKey` for addressing and review. */
  id: string;
  /** What the student is asked to mark. Target language. */
  prompt: string;
  unit: Unit;
  /** The key. Never sent to the browser. */
  spans: Span[];
  /** Why a missed mark should have been found. Required on a question with spans. */
  missHint: string;
  /** Why an extra mark is wrong — the traps in this text. */
  fpHint: string;
}

/** A span that lost its anchor when the passage was edited. */
export interface Orphan {
  /** The span's own id — putting it back restores the same span. */
  id: string;
  /** The question it belonged to. */
  qid: string;
  /** The words it covered, as they were written. */
  surface: string;
  why: string;
}

/** Checks per question. `0` means unlimited. */
export type Attempts = 0 | 1 | 2 | 3;

export const ATTEMPTS: readonly Attempts[] = [0, 1, 2, 3];

/** What one mark outside the key costs, in found marks. */
export type Penalty = 'off' | 'half' | 'full';

export const PENALTIES: readonly Penalty[] = ['off', 'half', 'full'];

export const PENALTY_WEIGHT: Readonly<Record<Penalty, number>> = { off: 0, half: 0.5, full: 1 };

/** Exercise-wide delivery settings — step 4. None of them touches the content. */
export interface Settings {
  attempts: Attempts;
  /** Pass mark per question, percent, compared with `>=`. */
  threshold: number;
  penalty: Penalty;
  /** «Det er N å finne». Off by default: it turns the tail into counting (DECISIONS §5). */
  showCount: boolean;
  /** `missHint` / `fpHint` after a failed check. */
  hints: boolean;
  /** Whether «Vis fasit» exists. */
  revealKey: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  attempts: 0,
  threshold: 70,
  penalty: 'half',
  showCount: false,
  hints: true,
  revealKey: true,
};

/** The whole document, as the builder edits it. */
export interface HighlightInTextContent {
  title: string;
  /** The standing instruction above the passage. Target language. */
  instruction: string;
  /** One passage; a blank line starts a paragraph. */
  text: string;
  questions: Question[];
  /** Marks waiting for the author after a text edit. Must be empty to assign. */
  orphans: Orphan[];
  settings: Settings;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newQuestion(): Question {
  return { id: newId(), prompt: '', unit: 'word', spans: [], missHint: '', fpHint: '' };
}

/**
 * A blank document with one empty question.
 *
 * The prototype seeds a Norwegian instruction; that would reach a Ukrainian school (plan 67
 * §3.7). The instruction comes from the course language's pack (presets.ts), empty where
 * there is none.
 */
export function emptyContent(instruction = ''): HighlightInTextContent {
  return {
    title: '',
    instruction,
    text: '',
    questions: [newQuestion()],
    orphans: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** How many checks each question allows, or `null` for unlimited. */
export function maxChecks(settings: Settings): number | null {
  return settings.attempts === 0 ? null : settings.attempts;
}

/** The pass mark in found marks rather than percent — what step 4 tells the author. */
export function passMark(settings: Settings, spans: number): number {
  if (spans <= 0) return 0;
  return Math.ceil((settings.threshold / 100) * spans);
}
