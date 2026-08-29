// What a student is allowed to see before answering.
//
// For this template that is: the instruction, the columns, the statements as text, the
// passage when the author attached one, and the settings that change what the runner may
// draw. Which column is right, the author's line and the quote that proves it live in the
// key column and arrive from `check` (grading.ts) — never here.
//
// Three things this file is responsible for beyond omission:
//
//   1. **Unready rows never reach the student.** A row with no text or no key is dropped
//      (`readyRows`) — the projection is where that happens, not the runner.
//   2. **The row order is decided server-side** (plan 54 §3.5). A runner that shuffled
//      locally would be shuffling something the network tab had already shown in order.
//      Columns are never shuffled, in this file or anywhere else.
//   3. **`shuffleRows` is applied, not shipped.** A client cannot act on it; it can only
//      contradict what it was sent.
//
// The passage is the one place this projection has to make a judgement rather than a
// deletion. `source.mode: 'inline'` with `showText: false` means the author attached a text
// and then chose not to put it on the exercise screen — so it is withheld here rather than
// sent with a flag saying "do not draw this", which is the same text one devtools tab away.

import { readyRows } from './derive.js';
import type { Layout, MultipleChoiceGroupContent, RetryPolicy, Settings, SourceMode } from './model.js';
import { readContent } from './persistence.js';
import { identityShuffle } from './shuffle.js';

export interface ProjectedColumn {
  id: string;
  label: string;
}

export interface ProjectedRow {
  id: string;
  text: string;
}

/** The material, as far as the student is concerned. */
export interface ProjectedSource {
  mode: SourceMode;
  label: string;
  /** Present in `inline` mode with `showText` on, and only then. */
  text?: string;
  /** Present in `link` mode, when the author picked a lesson. */
  lessonId?: string;
}

/**
 * The settings that change what the student sees or may do.
 *
 * `retry` is carried even though a check already reports `attemptsLeft`: the runner decides
 * *before* the first check whether «Prøv de feile igjen» exists at all, and it reveals
 * nothing — knowing that a second check exists is not knowing which rows are wrong.
 *
 * `passThreshold` is carried for the same kind of reason: BEHAVIOR shows the pass mark in
 * the summary («P% riktig — kravet er T%»), and a student who is told the requirement after
 * failing it learns less than one who knew it going in. It cannot be gamed — the score is
 * computed on the server either way.
 *
 * `lockCorrect` and `revealKey` are **not** carried. Both are decisions the server makes and
 * hands down in the check result: `locked` says which rows are frozen, `keyColumnId` appears
 * or does not. A client told `lockCorrect: false` could unfreeze rows the server froze.
 */
export interface ProjectedSettings {
  numbering: boolean;
  layout: Layout;
  retry: RetryPolicy;
  progress: boolean;
  showText: boolean;
  passThreshold: number;
}

export interface StudentProjection {
  instruction: string;
  source: ProjectedSource;
  columns: ProjectedColumn[];
  rows: ProjectedRow[];
  settings: ProjectedSettings;
}

/** Deterministic when nothing is injected; the server supplies the per-attempt seed. */
export type Shuffle = <T>(items: readonly T[]) => T[];

/**
 * Project the whole document for one student.
 *
 * `shuffle` is injected rather than called from here so the server can seed it per attempt
 * and the builder preview can reshuffle on demand — and so this function stays pure and
 * testable, which a `Math.random` inside would not be.
 *
 * Takes both columns because the key side is what says whether a row is ready: a row's
 * `answer` lives in `expected_answers`, so `content` alone cannot tell a finished statement
 * from a half-written one. `multiple_choice` needed only the content column; this one
 * cannot, and a caller passing `{}` gets an empty table rather than a leak.
 */
export function toStudentProjection(
  content: unknown,
  expectedAnswers: unknown,
  shuffle: Shuffle = identityShuffle,
): StudentProjection {
  const ex = fromColumns(content, expectedAnswers);
  const s = ex.settings;

  const ready = readyRows(ex).map((r): ProjectedRow => ({ id: r.id, text: r.text }));

  return {
    instruction: ex.instruction,
    source: projectSource(ex),
    columns: ex.columns.map((c) => ({ id: c.id, label: c.label })),
    rows: s.shuffleRows ? shuffle(ready) : ready,
    settings: projectSettings(s),
  };
}

export function projectSettings(s: Settings): ProjectedSettings {
  return {
    numbering: s.numbering,
    layout: s.layout,
    retry: s.retry,
    progress: s.progress,
    showText: s.showText,
    passThreshold: s.passThreshold,
  };
}

function projectSource(ex: MultipleChoiceGroupContent): ProjectedSource {
  const { source, settings } = ex;
  const projected: ProjectedSource = { mode: source.mode, label: source.label };

  if (source.mode === 'inline' && settings.showText && source.text.trim() !== '') {
    projected.text = source.text;
  }
  if (source.mode === 'link' && source.lessonId !== undefined) {
    projected.lessonId = source.lessonId;
  }

  return projected;
}

/**
 * Rebuild just enough of the document to know which rows are ready.
 *
 * Not `fromPersisted`: that returns the authored document, keys and all, and handing it to
 * a projection would put the thing being withheld one property access away from the thing
 * being returned. This reads the content column and asks the key column one question per
 * row — is there an answer — without ever carrying the answer itself into the result.
 */
function fromColumns(content: unknown, expectedAnswers: unknown): MultipleChoiceGroupContent {
  const persisted = readContent(content);
  const answered = readAnsweredIds(expectedAnswers, persisted.columns.map((c) => c.id));

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    source: persisted.source,
    columns: persisted.columns,
    settings: persisted.settings,
    rows: persisted.rows.map((r) => ({
      id: r.id,
      text: r.text,
      // A placeholder that is truthy exactly when the real key exists and points at a live
      // column. `readyRows` asks nothing else of it, and no caller of this function ever
      // sees the row objects — only the projected `{ id, text }`.
      answer: answered.has(r.id) ? persisted.columns[0]?.id ?? null : null,
      why: '',
      quote: '',
    })),
  };
}

function readAnsweredIds(expectedAnswers: unknown, columnIds: readonly string[]): Set<string> {
  const live = new Set(columnIds);
  const out = new Set<string>();
  const record = expectedAnswers as { rows?: Record<string, { answer?: unknown }> } | null;
  const rows = typeof record === 'object' && record !== null ? record.rows : undefined;
  if (typeof rows !== 'object' || rows === null) return out;

  for (const [id, key] of Object.entries(rows)) {
    const answer = (key as { answer?: unknown } | null)?.answer;
    if (typeof answer === 'string' && live.has(answer)) out.add(id);
  }
  return out;
}
