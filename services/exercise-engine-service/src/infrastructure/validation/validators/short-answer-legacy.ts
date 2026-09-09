import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import { checkShortAnswer, type ShortAnswerKey } from './short-answer-diff.js';

interface ShortAnswerSubmission {
  text: string;
}

/**
 * The old `short_answer`: one question, a list of accepted strings, a word-by-word diff.
 *
 * Lifted out of the validator unchanged when the template was rewritten to the design
 * handoff (plan 51). It is not deprecated code kept out of sentiment — 144 seeded
 * exercises are still written this way, and plan 51 §8 Q1 leaves them live until the
 * catalogue is rewritten. The engine picks between the two by the shape of the document,
 * so this keeps working exactly as it did, and the new grader never sees a document it
 * would read as an empty question set.
 *
 * Most of those 144 are grammar transformations — indirect speech, the passive,
 * inversion — which have one intended rewrite and no room for semantic elements. Where
 * they end up is an open question this plan deliberately did not answer.
 *
 * Its own behaviour, unchanged: the submission is aligned against the closest accepted
 * answer word by word. An exact match scores instantly, a near miss is marked wrong with
 * the offending words named in `details`, and only an answer that is nowhere near the key
 * goes to a person — it may be a phrasing the author never listed, and marking that wrong
 * would be worse than making the learner wait.
 */
export function gradeLegacyShortAnswer(input: {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  checkSettings: Record<string, unknown>;
}): Result<ValidationOutcome, ValidationError> {
  const submitted = readSubmission(input.submittedAnswer);
  if (submitted === null) {
    return Result.fail(
      new ValidationError('SCHEMA_MISMATCH', 'Answer must carry the typed text in `text`'),
    );
  }
  const expected = input.expectedAnswers as ShortAnswerKey;

  const text = submitted.text;
  const diff = checkShortAnswer(expected, text);

  if (diff.ok === true && !passesCaseGate(expected, text, input.checkSettings)) {
    // Right words, wrong capitalisation — and this exercise counts that.
    return Result.ok({
      correct: false,
      score: 0,
      details: { matched: null, reason: 'case_mismatch', target: diff.target },
      requiresReview: false,
    });
  }

  if (diff.ok === null) {
    return Result.ok({
      correct: false,
      score: 0,
      details: { matched: null },
      requiresReview: true,
    });
  }

  return Result.ok({
    correct: diff.ok,
    score: diff.score,
    details: {
      matched: diff.ok ? 'accepted_answer' : null,
      target: diff.target,
      distance: diff.distance,
      counts: diff.counts,
      tokens: diff.tokens,
    },
    requiresReview: false,
  });
}

/**
 * The shape AJV used to guarantee.
 *
 * `short_answer` left `OWN_SUBMISSION_SHAPE`'s complement when the template was
 * rewritten, because the new key and the new submission share no shape. The old form's
 * submission still has one, and dropping the check along with the schema would have
 * turned a client bug into `text: undefined` graded as an empty answer.
 */
function readSubmission(answer: unknown): ShortAnswerSubmission | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null;
  const { text } = answer as { text?: unknown };
  return typeof text === 'string' ? { text } : null;
}

/**
 * The diff itself always compares case-insensitively — a wrong ending has to be findable
 * whatever the learner capitalised. Exercises that opt into `case_sensitive` get their
 * exact match re-checked literally here.
 */
function passesCaseGate(
  expected: ShortAnswerKey,
  text: string,
  settings: Record<string, unknown>,
): boolean {
  if (settings['case_sensitive'] !== true) return true;
  const value = text.trim();
  const candidates = [
    ...(expected.accepted_answers ?? []),
    ...(expected.reference_answer ? [expected.reference_answer] : []),
  ];
  return candidates.some((candidate) => candidate.trim() === value);
}
