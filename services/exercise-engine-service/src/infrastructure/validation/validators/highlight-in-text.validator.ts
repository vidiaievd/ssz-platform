import { Injectable } from '@nestjs/common';
import { check, fromPersisted, readQuestionStates } from '@ssz/shared-kernel/highlight-in-text';
import type { CharRange, QuestionState } from '@ssz/shared-kernel/highlight-in-text';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/**
 * Grades `highlight_in_text`: one question per submit, inside one attempt (plan 67, Q1-A).
 *
 * Every decision is the kernel's `check` — snapping the marks to tokens, merging overlaps,
 * grading against the question's key with the penalty, the per-question budget, whether a
 * reveal is allowed, and how much of the key the answer may carry (a count of missed spans,
 * never their positions — AC-S5). This file gets the inputs right, and one of them is a fact
 * about the attempt that the submit handler writes over the submission before this runs:
 *
 *   * **every question's state so far** (`questions`) — checks made, the first check's score
 *     and verdict, passed, revealed, closed. The budget is per question and the evidence is
 *     each question's *first* check (DECISIONS §6), so the state has to survive from submit
 *     to submit; it is carried forward in the attempt's own details the way plan 54 carries
 *     `firstAnswer`, and the handler reads it back from there, never from the client.
 *
 * The outcome is about the attempt, not the question: `score` is the mean of the first
 * checks over the ready questions and `passed` compares it with `settings.threshold`. The
 * question's own verdict is in the details, where the runner reads it. `evidenceNow` is the
 * kernel's `completedNow` — the one submit that closed the last question, and the only one
 * the engine publishes for.
 *
 * Nothing routes to a teacher: the verdict is a comparison of token runs.
 */
@Injectable()
export class HighlightInTextValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be `{ questionId, marks: [{ start, end }], reveal? }` — one question per submit',
        ),
      );
    }

    const outcome = check({
      ex: fromPersisted(input.content, input.expectedAnswers),
      questionId: submission.questionId,
      marks: submission.marks,
      reveal: submission.reveal,
      questions: submission.questions,
    });

    if (!outcome.ok) {
      return Result.fail(new ValidationError(outcome.code, REFUSALS[outcome.code]));
    }

    const r = outcome.result;
    return Result.ok<ValidationOutcome, ValidationError>({
      correct: r.passed,
      score: r.attemptPct,
      passed: r.attemptPassed,
      evidenceNow: r.completedNow,
      // An allowlist of the kernel's result, field by field, so a field added there later
      // does not travel to the learner by being forgotten here.
      details: {
        questionId: r.questionId,
        /** This check of this question, after the penalty. On a reveal: its first check. */
        pct: r.pct,
        passed: r.passed,
        exact: r.exact,
        near: r.near,
        /** A count only (AC-S5). */
        miss: r.miss,
        fp: r.fp,
        total: r.total,
        cells: r.cells,
        ...(r.missHint === undefined ? {} : { missHint: r.missHint }),
        ...(r.fpHint === undefined ? {} : { fpHint: r.fpHint }),
        // The key with its reasons — only on a reveal.
        ...(r.key === undefined ? {} : { key: r.key }),
        attempt: r.attempt,
        /** Null for unlimited. */
        checksLeft: r.checksLeft,
        closed: r.closed,
        revealed: r.revealed,
        /** Every ready question's state — the rail, and what the handler carries forward. */
        questions: r.questions,
        complete: r.complete,
        attemptPct: r.attemptPct,
        attemptPassed: r.attemptPassed,
      },
      requiresReview: false,
    });
  }
}

const REFUSALS: Record<string, string> = {
  HT_MARK_UNSNAPPABLE: 'A mark covers no word of the passage',
  HT_QUESTION_UNKNOWN: 'This exercise has no such question to answer',
  HT_QUESTION_CLOSED: 'This question is closed and cannot be submitted again',
  HT_REVEAL_NOT_ALLOWED: 'The key cannot be shown for this question now',
};

interface Submission {
  questionId: string;
  marks: CharRange[];
  reveal: boolean;
  questions: QuestionState[];
}

/**
 * The shape of a submission, checked here because AJV cannot: the template's answer schema
 * describes the author's key, and the submission is one question's marks — so the type is in
 * `OWN_SUBMISSION_SHAPE`.
 *
 * A mark's offsets must be non-negative integers with `end > start`; whether they cover a
 * token is the kernel's question (`HT_MARK_UNSNAPPABLE`, AC-G7). `marks` may be empty only on
 * a reveal — «Sjekk» is disabled without a mark (AC-S1), so an empty check is a client bug
 * rather than an answer.
 *
 * `questions` is read leniently and is not the client's to decide: the submit handler
 * overwrites it with what the attempt records. It is read at all so a direct call in a test
 * can drive a second submit without a database.
 */
function readSubmission(submitted: unknown): Submission | null {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) return null;
  const raw = submitted as {
    questionId?: unknown;
    marks?: unknown;
    reveal?: unknown;
    questions?: unknown;
  };

  if (typeof raw.questionId !== 'string' || raw.questionId === '') return null;
  const reveal = raw.reveal === true;

  const marks: CharRange[] = [];
  if (raw.marks !== undefined || !reveal) {
    if (!Array.isArray(raw.marks)) return null;
    for (const entry of raw.marks) {
      if (typeof entry !== 'object' || entry === null) return null;
      const { start, end } = entry as { start?: unknown; end?: unknown };
      if (!isOffset(start) || !isOffset(end) || end <= start) return null;
      marks.push({ start, end });
    }
    if (marks.length === 0 && !reveal) return null;
  }

  return {
    questionId: raw.questionId,
    marks,
    reveal,
    questions: readQuestionStates(raw.questions),
  };
}

function isOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
