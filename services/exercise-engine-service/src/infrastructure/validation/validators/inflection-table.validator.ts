import { Injectable } from '@nestjs/common';
import { check, fromPersisted } from '@ssz/shared-kernel/inflection-table';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** Longer than any form a cell asks for; a guard against a body that is not an answer. */
const MAX_CELL_LENGTH = 120;

/** The cell key as the template's answer schema spells it: `<rowId>:<slotId>`. */
const CELL_KEY = /^[A-Za-z0-9_-]+:[A-Za-z]+$/;

/**
 * Grades `inflection_table`: every asked cell of the table at once (plan 69 §3.4).
 *
 * The mechanics are `sort_into_buckets`': one `Sjekk` decides the score, right cells lock,
 * «Prøv de gale på nytt» re-sends the table with the wrong ones re-answered, and the author's
 * budget closes it — all of it the kernel's `check`. As for sort, three of the inputs are
 * facts about the attempt that the submit handler writes over the submission before this runs:
 *
 *   * **which check this is** — the budget (`settings.attempts`) lives on the attempt;
 *   * **which cells are locked** — a cell found right stays right, whatever is resent;
 *   * **what each cell held on the first check** (`firstAnswers`) — the score is first-check
 *     accuracy over every asked cell, an empty one counting as wrong (decision Q6-A).
 *
 * A fourth is new with this type: **whether the attempt is graded** — one check, no key, no
 * hint (Q8-A of plan 67). A graded attempt is never reopened, so the budget holds by itself;
 * the flag is what makes the first check close the table and keep the key back.
 *
 * The details reuse sort's field names for exactly the three facts the handler reads back
 * between checks — `closed`, `locked`, `items[].itemId`, `items[].firstAnswer` — and the item
 * is the cell, keyed `rowId:slotId` as the kernel's `itemsOf` spells it for addressing.
 *
 * How much of the key a check carries is the kernel's decision too: the verdict, the near miss
 * and the author's reason for every wrong cell on every check (DECISIONS §3), the correct form
 * only under `revealKey`. `passed` is returned because the pass mark is the document's
 * `settings.threshold`.
 *
 * Nothing routes to a teacher: the verdict is a comparison per cell.
 */
@Injectable()
export class InflectionTableValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          `Answer must be \`{ cells: { "<rowId>:<slotId>": "<form>" } }\` — at most ${MAX_CELL_LENGTH} characters a cell`,
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
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no asked cell with a key'));
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: result.correctNow === result.total,
      score: result.pct,
      passed: result.passed,
      details: {
        totalItems: result.total,
        /** Right on the first check — what the score counts. */
        passedItems: result.correct,
        /** Right now — the progress line and the live region. */
        correctNow: result.correctNow,
        /** Bank mode: cells filled wrongly on the first check, each costing a right one. */
        falsePositives: result.falsePositives,
        pct: result.pct,
        passed: result.passed,
        attempt: result.attempt,
        checksLeft: result.checksLeft,
        closed: result.closed,
        locked: result.locked,
        // The row grain (DECISIONS §2): recorded on every check, drawn under `rowVerdict`.
        rows: result.rows,
        items: result.cells.map((cell) => ({
          itemId: cell.key,
          rowId: cell.rowId,
          slotId: cell.slotId,
          value: cell.value,
          correct: cell.ok,
          firstCorrect: cell.firstOk,
          /** What the cell held on the first check, carried forward by the handler. */
          firstAnswer: result.firstValues[cell.key] ?? '',
          ...(cell.near === undefined ? {} : { near: cell.near }),
          ...(cell.why === undefined ? {} : { why: cell.why }),
          ...(cell.correct === undefined ? {} : { correctForm: cell.correct }),
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
 * describes the author's key (a form, its variants and a reason per cell), and the submission
 * is a form per cell — so the type is in `OWN_SUBMISSION_SHAPE`.
 *
 * A key must look like a cell key and a value must be a string of sensible length. A
 * well-formed key the table does not ask is *not* refused: the kernel ignores it, and refusing
 * would strand a student whose table the author re-published under them with a row removed.
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
    if (!CELL_KEY.test(key)) return null;
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
