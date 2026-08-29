import { Injectable } from '@nestjs/common';
import {
  check,
  fromPersisted,
  isMultipleChoiceGroupDocument,
} from '@ssz/shared-kernel/multiple-choice-group';
import type { Answers } from '@ssz/shared-kernel/multiple-choice-group';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';
import { gradeLegacyMultipleChoiceGroup } from './multiple-choice-group-legacy.js';

/**
 * Grades `multiple_choice_group`: a table of statements sharing one set of answer
 * columns, handed in whole.
 *
 * The unit of work is the group, so unlike `multiple_choice` nothing was judged before
 * this ran. One call decides the score, whether the table closes, which rows freeze, and
 * how much of the key the student is allowed to see at this moment — and all four are the
 * kernel's `check`, not this file's. What this file does is get the *inputs* right, and
 * three of them are facts about the attempt rather than claims in the submission:
 *
 *   * **which check this is.** The attempt budget (`retry`: 1 / 2 / 99 checks) lives on
 *     the attempt, and a client that carried its own attempt number would buy itself
 *     another go by sending a smaller one (plan 54 §3.3).
 *   * **which rows are locked.** Under `lockCorrect` a row that came out right freezes,
 *     and «frozen» has to mean the server keeps its answer — otherwise unfreezing a row
 *     costs one request. So the locked rows are re-answered here from the key, over
 *     whatever the client sent for them. It can only ever restore a correct answer: a row
 *     is locked because it was right.
 *   * **the first answer per row.** IMPLEMENTATION.md asks for it, and not for the
 *     student: which statements a cohort gets wrong on the *first* pass is the signal
 *     about whether the text was understood. It is carried forward by the submit handler
 *     from the previous check's details, and lands in the details of every later one.
 *
 * `passed` is returned rather than left to the handler's `passingThreshold`, because this
 * template's pass mark is `settings.passThreshold` on the document, where the author set
 * it (plan 54 §3.4). It is compared with `>=`, never `>` — the kernel does that, and the
 * handoff's test checklist asks for it by name.
 *
 * Nothing routes to a teacher. `requiresReview` is always false and the type is not in
 * `REVIEWABLE_EXERCISE_TYPES`: the verdict is an id comparison per row.
 *
 * Two document shapes reach this validator and the shape decides which grader runs. Two
 * seeded exercises are still written the old way until phase 3 (plan 54 §1.1), and
 * `multiple-choice-group-legacy.ts` holds that path unchanged. Dispatching on the document
 * rather than on a version field is deliberate — both were written before any version
 * existed, so a field could only ever be absent there.
 */
@Injectable()
export class MultipleChoiceGroupValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    if (!isMultipleChoiceGroupDocument(input.content)) {
      return gradeLegacyMultipleChoiceGroup(input);
    }

    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be `{ answers: { <rowId>: <columnId> } }` — one entry per statement answered',
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);

    const result = check({
      ex: document,
      answers: withLockedRows(document, submission),
      attempt: submission.attempt,
      reveal: submission.reveal,
      locked: submission.locked,
    });

    if (result.total === 0) {
      return Result.fail(
        new ValidationError('INVALID_EXERCISE', 'Exercise has no finished statements'),
      );
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: result.correct === result.total,
      score: result.pct,
      passed: result.passed,
      details: {
        totalItems: result.total,
        passedItems: result.correct,
        // The state of the table after this check, which is what the runner draws:
        // whether it may be checked again, and which rows are frozen if it is.
        attempt: result.attempt,
        attemptsLeft: result.attemptsLeft,
        closed: result.closed,
        locked: result.locked,
        items: result.rows.map((row) => ({
          itemId: row.rowId,
          /** The column picked; null when the statement was left unanswered. */
          submitted: row.answer,
          correct: row.correct,
          /**
           * What was picked on the first check of this table. Equal to `submitted` on
           * that first check, and preserved by the handler across every later one.
           */
          firstAnswer: submission.firstAnswers[row.rowId] ?? row.answer,
          // Present only once the table is closed and the author left the key visible;
          // withheld while a retry is still available, or the retry would be theatre.
          ...(row.keyColumnId === undefined ? {} : { keyColumnId: row.keyColumnId }),
          ...(row.why === undefined ? {} : { why: row.why }),
          ...(row.quote === undefined ? {} : { quote: row.quote }),
        })),
      },
      requiresReview: false,
    });
  }
}

interface Submission {
  answers: Answers;
  attempt: number;
  reveal: boolean;
  locked: string[];
  firstAnswers: Record<string, string | null>;
}

/**
 * The locked rows answered from the key rather than from the submission.
 *
 * A row is in `locked` because an earlier check found it right, and the server put it
 * there. Re-answering it from the key is what makes the freeze a freeze: the alternative
 * is a client that sends a different column for a locked row and is graded on it.
 */
function withLockedRows(
  document: ReturnType<typeof fromPersisted>,
  submission: Submission,
): Answers {
  if (submission.locked.length === 0) return submission.answers;

  const answers: Record<string, string> = { ...submission.answers };
  for (const rowId of submission.locked) {
    const row = document.rows.find((r) => r.id === rowId);
    if (row?.answer != null) answers[rowId] = row.answer;
  }
  return answers;
}

/**
 * The shape of a submission, checked here because AJV cannot: the template's answer
 * schema describes the author's key — a column id, a line and a quote per row — and the
 * submission is a map of picks, so `multiple_choice_group` is in `OWN_SUBMISSION_SHAPE`.
 *
 * `attempt`, `locked` and `firstAnswers` are read leniently and are not the client's to
 * decide: the submit handler overwrites all three with what the attempt records before
 * this runs. They are read at all so that a direct call in a test can drive a second
 * check without a database.
 *
 * `reveal` *is* the client's — it is «Vis fasit», the student giving up on the retry —
 * and it costs them the attempt rather than earning anything: the table closes with the
 * score it already had.
 */
function readSubmission(submitted: unknown): Submission | null {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) return null;
  const raw = submitted as {
    answers?: unknown;
    attempt?: unknown;
    reveal?: unknown;
    locked?: unknown;
    firstAnswers?: unknown;
  };

  if (typeof raw.answers !== 'object' || raw.answers === null || Array.isArray(raw.answers)) {
    return null;
  }

  const answers: Record<string, string> = {};
  for (const [rowId, columnId] of Object.entries(raw.answers as Record<string, unknown>)) {
    // An unanswered row is an absent one. A null sent explicitly means the same thing
    // and is dropped rather than refused; anything else is a client bug.
    if (columnId === null || columnId === undefined || columnId === '') continue;
    if (typeof columnId !== 'string') return null;
    answers[rowId] = columnId;
  }

  const firstAnswers: Record<string, string | null> = {};
  if (typeof raw.firstAnswers === 'object' && raw.firstAnswers !== null) {
    for (const [rowId, columnId] of Object.entries(raw.firstAnswers as Record<string, unknown>)) {
      firstAnswers[rowId] = typeof columnId === 'string' && columnId !== '' ? columnId : null;
    }
  }

  return {
    answers,
    attempt: typeof raw.attempt === 'number' && raw.attempt >= 1 ? Math.trunc(raw.attempt) : 1,
    reveal: raw.reveal === true,
    locked: Array.isArray(raw.locked)
      ? raw.locked.filter((id): id is string => typeof id === 'string')
      : [],
    firstAnswers,
  };
}
