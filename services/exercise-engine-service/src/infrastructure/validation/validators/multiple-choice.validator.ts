import { Injectable } from '@nestjs/common';
import {
  fromPersisted,
  gradeAttempt,
  isMultipleChoiceDocument,
} from '@ssz/shared-kernel/multiple-choice';
import type { SubmittedAnswer } from '@ssz/shared-kernel/multiple-choice';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';
import { gradeLegacyMultipleChoice } from './multiple-choice-legacy.js';

/**
 * Grades `multiple_choice`: a set of questions answered one at a time, scored on the
 * first attempt alone.
 *
 * The judging happened already — each pick was graded by `answer-question` the moment it
 * was made, because the key does not reach the browser and the 50/50 and the retry are
 * only meaningful while it does not (plan 53 §3.2). What runs here is the attempt as a
 * whole, and it runs from scratch: a submission is a request, and the verdicts a client
 * sends back are verdicts a client could have written. Only the picks are read, and even
 * those are overwritten by what the attempt recorded before they get here
 * (`withRecordedPicks` in the submit handler) — the attempt number is the score, and it
 * is the server's fact rather than the client's claim.
 *
 * The score is the share of questions taken on the first attempt, as a percentage
 * (README: "Score counts first-attempt correctness only"). A question never answered
 * counts as wrong: otherwise walking away from half a set scores better than finishing
 * it (plan 53 §3.5).
 *
 * Nothing routes to a teacher. `requiresReview` is always false and the type is not in
 * `REVIEWABLE_EXERCISE_TYPES`: the verdict is an id comparison, and «the server counts»
 * is not the same thing as «a person marks» (plan 53 §3.10).
 *
 * Two document shapes reach this validator, and the shape decides which grader runs.
 * Plan 53 §8 Q2 leaves 121 exercises of the old single-question form live;
 * `multiple-choice-legacy.ts` holds that path unchanged. Dispatching on the document
 * rather than on a version field is deliberate — those 121 were written before any
 * version existed, so a field could only ever be absent there.
 */
@Injectable()
export class MultipleChoiceValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    if (!isMultipleChoiceDocument(input.content)) {
      return gradeLegacyMultipleChoice(input);
    }

    const answers = readSubmittedAnswers(input.submittedAnswer);
    if (answers === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be a list of { questionId, optionId, attempt } — one entry per question answered',
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);
    const outcome = gradeAttempt(document, answers);
    if (outcome.total === 0) {
      return Result.fail(
        new ValidationError('INVALID_EXERCISE', 'Exercise has no answerable questions'),
      );
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: outcome.correct,
      score: outcome.score,
      details: {
        totalItems: outcome.total,
        // Questions taken on the first attempt — the only ones that score, and so the
        // only tally that agrees with the percentage beside it.
        passedItems: outcome.firstTry,
        items: outcome.outcomes.map((o) => ({
          itemId: o.questionId,
          /** Null when the student left the set before reaching this question. */
          submitted: o.optionId,
          correct: o.correct,
          firstTry: o.firstTry,
          attempt: o.attempt,
        })),
      },
      requiresReview: false,
    });
  }
}

/**
 * The submission is not checked by AJV before this: the template's answer schema
 * describes the author's key — a correct option id and the rebuttals per question — and
 * one schema cannot usefully describe both that and a list of picks. So the shape is
 * checked here, where a bad one is a client bug rather than a wrong answer.
 *
 * Both wire shapes are accepted, because the attempt API wraps the list and the older
 * clients send it bare.
 *
 * `attempt` is read leniently — a missing one is treated as the first try by the kernel —
 * because the number that decides the score is not taken from here anyway: the submit
 * handler replaces the whole list with what the attempt recorded.
 */
function readSubmittedAnswers(submitted: unknown): SubmittedAnswer[] | null {
  const list = Array.isArray(submitted)
    ? submitted
    : typeof submitted === 'object' && submitted !== null
      ? (submitted as { answers?: unknown }).answers
      : undefined;

  if (!Array.isArray(list)) return null;

  const out: SubmittedAnswer[] = [];
  for (const raw of list) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { questionId, optionId, attempt } = raw as {
      questionId?: unknown;
      optionId?: unknown;
      attempt?: unknown;
    };
    if (typeof questionId !== 'string' || questionId === '') return null;
    out.push({
      questionId,
      optionId: typeof optionId === 'string' && optionId !== '' ? optionId : null,
      ...(typeof attempt === 'number' ? { attempt } : {}),
    });
  }
  return out;
}
