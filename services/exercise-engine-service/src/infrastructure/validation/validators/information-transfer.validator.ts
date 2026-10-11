import { Injectable } from '@nestjs/common';
import { check, fromPersisted } from '@ssz/shared-kernel/information-transfer';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** Longer than any fact a cell asks for; a guard against a body that is not an answer. */
const MAX_CELL_LENGTH = 120;

/** A field id as the kernel's `newId` makes it, with room for the fixture's longer ones. */
const FIELD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Grades `information_transfer`: every ready cell of the blank at once (plan 73 §3.6).
 *
 * The mechanics are `inflection_table`'s: one «Sjekk svarene» decides the score, right cells
 * lock, «Rett opp N felt» re-sends the blank with the wrong ones re-answered, and the author's
 * budget closes it — all of it the kernel's `check`. Four inputs are facts about the attempt
 * that the submit handler writes over the submission before this runs: which check this is,
 * which cells are locked, what each cell held on the first check (`firstAnswers`), and whether
 * the delivery is graded (one check, no key — Q8-A of plan 67).
 *
 * The details reuse the board's field names for the facts the handler reads back between
 * checks — `closed`, `locked`, `items[].itemId`, `items[].firstAnswer` — and the item is the
 * cell, keyed by the field id as the kernel's `itemsOf` spells it for addressing.
 *
 * Every cell's verdict is recorded twice, the first check's and this one's, `unread` included:
 * «the core could not read this as a time» is the report's «did not understand the form»
 * signal (DECISIONS §2), and the first check is what the report counts.
 *
 * Nothing routes to a teacher: a cell is compared, never judged. A cell the core cannot read
 * is told so — it is not handed to a person.
 */
@Injectable()
export class InformationTransferValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          `Answer must be \`{ cells: { "<fieldId>": "<value>" } }\` — at most ${MAX_CELL_LENGTH} characters a cell`,
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);
    const result = check({
      ex: document,
      answers: submission.cells,
      attempt: submission.attempt,
      locked: submission.locked,
      graded: submission.graded,
      // Absent on the first check, so that this check becomes the first.
      ...(submission.attempt > 1 ? { firstValues: submission.firstAnswers } : {}),
    });

    if (result.total === 0) {
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no ready field'));
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: result.correctNow === result.total,
      score: result.pct,
      passed: result.passed,
      details: {
        totalItems: result.total,
        /** Right on the first check — what the score counts. */
        passedItems: result.correct,
        /** Right now — the progress bar. */
        correctNow: result.correctNow,
        pct: result.pct,
        passed: result.passed,
        /** The pass mark travels with the verdict, never with the projection (plan 73 §5, 14). */
        passPct: result.passPct,
        /** «· et obligatorisk felt mangler» — on the first check, as the score. */
        missedRequired: result.missedRequired,
        /** Cells the core could not read on the first check — for the exercise report. */
        unread: result.cells.filter((cell) => cell.firstVerdict === 'unread').length,
        attempt: result.attempt,
        checksLeft: result.checksLeft,
        closed: result.closed,
        revealed: result.revealed,
        locked: result.locked,
        items: result.cells.map((cell) => ({
          itemId: cell.id,
          value: cell.value,
          verdict: cell.verdict,
          correct: cell.ok,
          firstVerdict: cell.firstVerdict,
          firstCorrect: cell.firstOk,
          /** What the cell held on the first check, carried forward by the handler. */
          firstAnswer: result.firstValues[cell.id] ?? '',
          ...(cell.canonical === undefined ? {} : { canonical: cell.canonical }),
          ...(cell.why === undefined ? {} : { why: cell.why }),
          ...(cell.hint === undefined ? {} : { hint: cell.hint }),
        })),
      },
      requiresReview: false,
    });
  }
}

interface Submission {
  cells: Record<string, string>;
  attempt: number;
  locked: string[];
  firstAnswers: Record<string, string>;
  graded: boolean;
}

/**
 * The shape of a submission, checked here because AJV cannot: the template's answer schema
 * describes the author's key (wordings and a reason per field), and the submission is a value
 * per field — so the type is in `OWN_SUBMISSION_SHAPE`.
 *
 * A key must look like a field id and a value must be a string of sensible length. A field the
 * blank does not have is *not* refused: the kernel ignores it, and refusing would strand a
 * student whose form the author re-published under them with a field removed.
 *
 * `attempt`, `locked`, `firstAnswers` and `graded` are read leniently and are not the client's
 * to decide: the submit handler overwrites them with what the attempt records. They are read
 * at all so a direct call in a test can drive a second check without a database.
 */
function readSubmission(submitted: unknown): Submission | null {
  if (!isRecord(submitted)) return null;
  const raw = submitted as {
    cells?: unknown;
    attempt?: unknown;
    locked?: unknown;
    firstAnswers?: unknown;
    graded?: unknown;
  };

  if (!isRecord(raw.cells)) return null;
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.cells)) {
    if (!FIELD_ID.test(key)) return null;
    if (typeof value !== 'string' || value.length > MAX_CELL_LENGTH) return null;
    cells[key] = value;
  }

  // An empty first answer is recorded as such; a missing one as nothing, so the kernel can
  // tell «empty on the first check» from «this check stands in for the first».
  const firstAnswers: Record<string, string> = {};
  if (isRecord(raw.firstAnswers)) {
    for (const [key, value] of Object.entries(raw.firstAnswers)) {
      firstAnswers[key] = typeof value === 'string' ? value : '';
    }
  }

  return {
    cells,
    attempt: typeof raw.attempt === 'number' && raw.attempt >= 1 ? Math.trunc(raw.attempt) : 1,
    locked: Array.isArray(raw.locked)
      ? raw.locked.filter((key): key is string => typeof key === 'string')
      : [],
    firstAnswers,
    graded: raw.graded === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
