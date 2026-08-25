// The validation engine — README "Dots are driven by the single validation engine
// (`ssIssues`), never by local step state".
//
// The rail dots, the inline messages on a card, the `Done` badge, the pre-assign gate and
// the server's publish preflight all read this one list. A second source of truth drifts
// within a week (IMPLEMENTATION.md, second pitfall), and the drift is invisible: the rail
// says amber, the gate says green, and neither is obviously the liar.
//
// Issues carry a code and the parameters its message needs, never the message itself: the
// teacher UI is localised into four languages.
//
// Every issue names what it is about — `rowId`, `fieldId`, `chunkId`, `clause` — rather
// than counting ("2 sentences have no rule"). A count cannot be rendered on the card it
// concerns and it lies after a reorder (plan 52 §5).

import { expectedIn } from './grading.js';
import { CLAUSE_IDS, isDeliverable, type ClauseId, type SentenceSchemaContent } from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's deep links both use it. */
export type IssueStep = 1 | 2 | 3 | 4;

export type Issue =
  // ── Step 1 — the schema ──
  | { code: 'NO_CLAUSE_ON'; level: 'blocker'; step: 1 }
  | { code: 'CLAUSE_NO_FIELDS'; level: 'blocker'; step: 1; clause: ClauseId }
  | { code: 'ROW_CLAUSE_OFF'; level: 'warning'; step: 1; rowId: string; clause: ClauseId }
  // ── Step 2 — the sentences ──
  | { code: 'NO_DELIVERABLE_ROWS'; level: 'blocker'; step: 2 }
  | { code: 'ROW_NO_TEXT'; level: 'blocker'; step: 2; rowId: string }
  | { code: 'ROW_UNPLACED'; level: 'blocker'; step: 2; rowId: string; count: number }
  | { code: 'ROW_REQUIRED_FIELD_EMPTY'; level: 'warning'; step: 2; rowId: string; fieldId: string }
  | { code: 'ROW_V2_VIOLATION'; level: 'warning'; step: 2; rowId: string; fieldId: string; count: number }
  // ── Step 3 — difficulty ──
  | { code: 'EXTRAS_ON_BUT_NONE'; level: 'warning'; step: 3 }
  // ── Step 4 — feedback ──
  | { code: 'ROW_NO_WHY'; level: 'blocker'; step: 4; rowId: string };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: SentenceSchemaContent): Issue[] {
  const out: Issue[] = [];

  // ── Step 1 ────────────────────────────────────────────────────────────────
  if (ex.clauses.length === 0) out.push({ code: 'NO_CLAUSE_ON', level: 'blocker', step: 1 });

  for (const clause of ex.clauses) {
    if ((ex.schema[clause] ?? []).length === 0) {
      out.push({ code: 'CLAUSE_NO_FIELDS', level: 'blocker', step: 1, clause });
    }
  }

  // Switching a clause type off does not break the sentences written in it — they keep
  // their schema and keep working. It only means no *new* sentence can choose it, which
  // is a warning about the author's intent, not about the document.
  for (const row of ex.rows) {
    if (!ex.clauses.includes(row.clause)) {
      out.push({ code: 'ROW_CLAUSE_OFF', level: 'warning', step: 1, rowId: row.id, clause: row.clause });
    }
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  for (const row of ex.rows) {
    if (row.text.trim() === '') {
      out.push({ code: 'ROW_NO_TEXT', level: 'blocker', step: 2, rowId: row.id });
      // Everything below is about placements, and an empty sentence has no words to
      // place. Reporting them too would put four blockers on one blank card.
      continue;
    }

    const unplaced = row.chunks.filter((c) => c.field === null).length;
    if (unplaced > 0) {
      out.push({ code: 'ROW_UNPLACED', level: 'blocker', step: 2, rowId: row.id, count: unplaced });
    }

    const fields = ex.schema[row.clause] ?? [];
    for (const field of fields) {
      if (!field.optional && expectedIn(row, field.id) === 0) {
        out.push({ code: 'ROW_REQUIRED_FIELD_EMPTY', level: 'warning', step: 2, rowId: row.id, fieldId: field.id });
      }
    }

    // V2: a main clause puts exactly one element in the first field. More than one piece
    // there usually means the author forgot to join them ("I" + "morgen"), which is why
    // this is a warning pointing at a fix rather than a blocker.
    const first = fields[0];
    if (row.clause === 'main' && first) {
      const count = expectedIn(row, first.id);
      if (count > 1) {
        out.push({ code: 'ROW_V2_VIOLATION', level: 'warning', step: 2, rowId: row.id, fieldId: first.id, count });
      }
    }
  }

  if (ex.rows.every((r) => !isDeliverable(r))) {
    out.push({ code: 'NO_DELIVERABLE_ROWS', level: 'blocker', step: 2 });
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  if (ex.settings.extras && ex.rows.every((r) => r.extras.length === 0)) {
    out.push({ code: 'EXTRAS_ON_BUT_NONE', level: 'warning', step: 3 });
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  for (const row of ex.rows) {
    // A blank card is already reported as ROW_NO_TEXT; asking it for a rule as well adds
    // a second blocker and no information.
    if (row.text.trim() !== '' && row.why.trim() === '') {
      out.push({ code: 'ROW_NO_WHY', level: 'blocker', step: 4, rowId: row.id });
    }
  }

  return out;
}

export function blockers(ex: SentenceSchemaContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

export function warnings(ex: SentenceSchemaContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'warning');
}

/** May this exercise be assigned? The gate's primary button and the publish preflight. */
export function isReady(ex: SentenceSchemaContent): boolean {
  return blockers(ex).length === 0;
}

export type StepState = 'ok' | 'warn' | 'err' | 'empty';

export interface StepStatus {
  state: StepState;
  /** Blocker count — what the rail's red badge shows. */
  errors: number;
  warnings: number;
}

/** One rail dot. Same list, filtered by step — that is the whole guarantee. */
export function stepState(ex: SentenceSchemaContent, step: IssueStep): StepStatus {
  const mine = issues(ex).filter((i) => i.step === step);
  const errors = mine.filter((i) => i.level === 'blocker').length;
  const warnings = mine.filter((i) => i.level === 'warning').length;
  if (errors > 0) return { state: 'err', errors, warnings };
  if (warnings > 0) return { state: 'warn', errors, warnings };
  return { state: 'ok', errors, warnings };
}

/** The green rows of the pre-assign gate — what the exercise does have. */
export interface Passes {
  deliverableRows: number;
  clausesCovered: ClauseId[];
  /** Rows where some chunk accepts more than one field. */
  rowsWithAlternatives: number;
  /** Chunk-level explanation overrides written across the set. */
  chunkNotes: number;
}

export function passes(ex: SentenceSchemaContent): Passes {
  const deliverable = ex.rows.filter(isDeliverable);
  return {
    deliverableRows: deliverable.length,
    clausesCovered: CLAUSE_IDS.filter((c) => deliverable.some((r) => r.clause === c)),
    rowsWithAlternatives: deliverable.filter((r) => r.chunks.some((c) => c.alt.length > 0)).length,
    chunkNotes: ex.rows.reduce(
      (n, r) => n + Object.values(r.fb).filter((t) => t.trim() !== '').length,
      0,
    ),
  };
}
