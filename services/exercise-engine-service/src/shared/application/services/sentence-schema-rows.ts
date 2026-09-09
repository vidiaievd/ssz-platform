import { deliverableRows, fieldsFor, grade, scoreRow } from '@ssz/shared-kernel/sentence-schema';
import type {
  Field,
  GradeResult,
  Placement,
  Row,
  SentenceSchemaContent,
} from '@ssz/shared-kernel/sentence-schema';

/** One sentence as the student hands it in: a board, and whether they gave up on it. */
export interface SubmittedRow {
  rowId: string;
  placement: Placement;
  /**
   * The student pressed `Vis riktig skjema` on this sentence.
   *
   * Carried in the submission and *not trusted from it*: a reveal is recorded on the
   * attempt when it happens, and the submit handler merges what the attempt knows over
   * what the client says. Otherwise revealing a sentence and then handing in the answer
   * it was just shown would score full marks.
   */
  revealed: boolean;
}

/** One sentence graded: the marks the runner draws, and what it was worth. */
export interface RowGrading {
  rowId: string;
  row: Row;
  fields: Field[];
  marks: GradeResult;
  solved: boolean;
  revealed: boolean;
  /** 0–100 for this sentence alone. A revealed sentence is worth nothing (§3.4). */
  score: number;
}

/**
 * Grade one sentence of a set against the document as it stands today.
 *
 * Returns `null` for a sentence the document no longer holds, or one the author has since
 * left unfinished. Plan 52 §6.7, the rule inherited from plan 51: a reader that quietly
 * fills such a row with zeros is worse than one that refuses, because it looks healthy.
 * Every caller here treats `null` as "this sentence cannot be spoken about".
 */
export function gradeSubmittedRow(
  document: SentenceSchemaContent,
  submitted: SubmittedRow,
): RowGrading | null {
  const row = deliverableRows(document).find((r) => r.id === submitted.rowId);
  if (!row) return null;

  const fields = fieldsFor(document, row);
  const marks = grade(row, fields, submitted.placement, document.settings);

  return {
    rowId: row.id,
    row,
    fields,
    marks,
    solved: marks.solved,
    revealed: submitted.revealed,
    // A revealed sentence is not credited, however the board ended up looking: the
    // student was handed the answer, and `Vis riktig skjema` fills it in for them.
    score: submitted.revealed ? 0 : marks.solved ? 100 : scoreRow(row, fields, marks),
  };
}

/**
 * What the whole set is worth.
 *
 * The handoff says this type "reports attempts, not a grade". On this platform every type
 * carries a score, and progress and spaced repetition are built on it (plan 52 §3.4), so
 * one is computed: the mean over the sentences the student was actually given. A sentence
 * never handed in counts as zero — it was part of the exercise.
 *
 * `allow_partial_credit` decides what an imperfect sentence is worth. With it, the share
 * of its fields that came out right — the same unit the old validator used, so a converted
 * exercise does not silently change what a percentage means. Without it, a sentence is
 * either solved or worth nothing.
 */
export function scoreSet(
  document: SentenceSchemaContent,
  gradings: RowGrading[],
  allowPartial: boolean,
): number {
  const given = deliverableRows(document);
  if (given.length === 0) return 100;

  const byRow = new Map(gradings.map((g) => [g.rowId, g]));
  const total = given.reduce((sum, row) => {
    const grading = byRow.get(row.id);
    if (!grading) return sum;
    if (grading.solved && !grading.revealed) return sum + 100;
    return sum + (allowPartial ? grading.score : 0);
  }, 0);

  return Math.round(total / given.length);
}

/**
 * Read a submission.
 *
 * AJV never sees this shape: the template's answer schema describes the author's key — a
 * map of fields per chunk — and one schema cannot usefully describe that and a board per
 * sentence both. So `sentence_schema` sits in `OWN_SUBMISSION_SHAPE` and the shape is
 * checked here, where a bad one is a client bug rather than a wrong answer.
 *
 * Both wire shapes are accepted, because the attempt API wraps the list and a bare list
 * is what the runner's own state looks like.
 */
export function readSubmittedRows(submitted: unknown): SubmittedRow[] | null {
  const list = Array.isArray(submitted)
    ? submitted
    : typeof submitted === 'object' && submitted !== null
      ? (submitted as { rows?: unknown }).rows
      : undefined;

  if (!Array.isArray(list)) return null;

  const out: SubmittedRow[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { rowId, placement, revealed } = raw as {
      rowId?: unknown;
      placement?: unknown;
      revealed?: unknown;
    };
    if (typeof rowId !== 'string' || rowId === '') return null;
    const board = readPlacement(placement);
    if (board === null) return null;
    out.push({ rowId, placement: board, revealed: revealed === true });
  }
  return out;
}

/** `fieldId → item ids, in the order the student stacked them`, or `null` if it is not. */
export function readPlacement(value: unknown): Placement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const out: Placement = {};
  for (const [fieldId, items] of Object.entries(value)) {
    if (!Array.isArray(items) || items.some((id) => typeof id !== 'string')) return null;
    out[fieldId] = items as string[];
  }
  return out;
}
