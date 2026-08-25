// Bulk paste — one sentence per line, fields separated by `|` in schema order.
//
// Source: `ssParseBulk` in the handoff's data.jsx; the format is README, "Paste several".
//
//   I morgen | skal | jeg | ikke | lese | boka
//   sub :: fordi | jeg | ikke | hadde | | tid
//
// A `clauseId ::` prefix picks the clause type; an empty segment leaves that field empty.
// This is how a page of a workbook becomes a set in one paste, and it is the only place
// in the builder where placements are made without touching the board.

import { newChunk, newRow, type ClauseId, type Row, type Schema } from './model.js';
import { CLAUSE_IDS } from './model.js';
import { tokenize } from './tokenize.js';

export interface ParseOptions {
  schema: Schema;
  /** Clause type for lines without a prefix. */
  defaultClause: ClauseId;
}

/**
 * Parse pasted text into rows.
 *
 * Segments map to fields positionally, and **only as far as the schema reaches**: extra
 * segments past the last field are appended to the text but left unplaced rather than
 * inventing fields to hold them. Phantom fields would be the worst possible outcome here
 * — the paste would appear to work and the schema would quietly be someone else's.
 */
export function parseBulk(text: string, options: ParseOptions): Row[] {
  const rows: Row[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    let clause = options.defaultClause;
    let body = trimmed;
    const prefix = /^([a-z]+)\s*::\s*(.*)$/i.exec(trimmed);
    if (prefix && (CLAUSE_IDS as readonly string[]).includes(prefix[1]!.toLowerCase())) {
      clause = prefix[1]!.toLowerCase() as ClauseId;
      body = prefix[2]!;
    }

    const fields = options.schema[clause] ?? [];
    const row = newRow(clause);

    // The i-th segment belongs to the i-th field — including the empty ones, which is why
    // the index has to advance over them. Dropping empties first would shift every field
    // after a deliberately empty one, silently, and only for that line.
    body.split('|').forEach((segment, index) => {
      const words = tokenize(segment);
      if (words.length === 0) return;
      const field = fields[index];
      for (const word of words) row.chunks.push(newChunk(word, field ? field.id : null));
    });

    row.text = row.chunks.map((c) => c.text).join(' ');
    if (row.chunks.length > 0) rows.push(row);
  }

  return rows;
}

/**
 * Apply a paste to the row list.
 *
 * Rows that were empty are dropped (BEHAVIOR.md): the blank card a builder starts with is
 * a placeholder, and keeping it above a fresh paste would make the set start with a
 * blocker every time.
 */
export function applyBulk(existing: Row[], parsed: Row[]): Row[] {
  return [...existing.filter((r) => r.text.trim() !== ''), ...parsed];
}
