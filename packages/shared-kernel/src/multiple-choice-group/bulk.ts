// Bulk paste — README "Bulk paste": one statement per line, the answer after a trailing
// `|` given as a column short code, a full label, or a 1-based column number.
//
// Lines without a marker arrive unanswered rather than being dropped or guessed at. That is
// the useful behaviour and not a fallback: a teacher pasting a list of statements out of a
// worksheet has the statements first and the key second, and an import that guessed
// «Riktig» for every unmarked line would produce a table that looks finished and is wrong.
//
// Appending replaces the empty rows rather than adding after them (BEHAVIOR S2.11) — a
// fresh document is four blank rows, and pasting six statements into it should leave six.

import { newRow } from './model.js';
import type { Column, MultipleChoiceGroupContent, Row } from './model.js';

export function parseBulk(columns: readonly Column[], text: string): Row[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      // The statement is the first field and the marker the last, so a statement containing
      // a pipe keeps everything between them: `A | B | R` is the statement "A | B",
      // answered R — not the statement "A" with "B" thrown away.
      const body = parts.shift() ?? '';
      const tag = parts.length > 0 ? (parts.pop() ?? '') : '';
      const middle = parts;
      const statement = [body, ...middle].join(' | ').trim();

      return { ...newRow(), text: statement, answer: resolve(columns, tag) };
    });
}

/** Append parsed rows, dropping the document's empty ones — BEHAVIOR S2.11. */
export function appendRows(
  ex: MultipleChoiceGroupContent,
  rows: readonly Row[],
): MultipleChoiceGroupContent {
  return { ...ex, rows: [...ex.rows.filter((r) => r.text.trim() !== ''), ...rows] };
}

/** Short code, full label, or 1-based index. Anything else leaves the row unanswered. */
function resolve(columns: readonly Column[], tag: string): string | null {
  const needle = tag.trim().toLowerCase();
  if (needle === '') return null;

  const named = columns.find(
    (c) => c.short.trim().toLowerCase() === needle || c.label.trim().toLowerCase() === needle,
  );
  if (named !== undefined) return named.id;

  if (/^\d+$/u.test(needle)) return columns[Number.parseInt(needle, 10) - 1]?.id ?? null;
  return null;
}
