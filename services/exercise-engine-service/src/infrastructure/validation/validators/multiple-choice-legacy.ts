import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';

interface McAnswer {
  correct_option_ids: string[];
}

/**
 * The old `multiple_choice`: one question, a key that is an array of option ids, and a
 * verdict that is a set comparison.
 *
 * Lifted out of the validator unchanged when the template was rewritten to the design
 * handoff (plan 53). It is not deprecated code kept out of sentiment — 121 seeded
 * exercises are still written this way, and plan 53 §8 Q2 limits the reseed to the first
 * lesson of `norsk-b1`. The engine picks between the two by the shape of the document, so
 * this keeps working exactly as it did, and the new grader never sees a document it would
 * read as an empty question set.
 *
 * It is also the form the placement test and the listening and reading lesson stages read
 * (plan 53 §1.2) — three consumers outside the exercise runner, which is why this path has
 * to stay honest rather than merely alive.
 *
 * Its own behaviour, unchanged: the submitted ids are compared with the expected ones as
 * sets. An exact match scores 100; with `allow_partial_credit` a partial selection scores
 * proportionally and each wrong pick cancels a correct one; without it, anything short of
 * exact scores nothing.
 */
export function gradeLegacyMultipleChoice(input: {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  checkSettings: Record<string, unknown>;
}): Result<ValidationOutcome, ValidationError> {
  const submitted = readSubmission(input.submittedAnswer);
  if (submitted === null) {
    return Result.fail(
      new ValidationError(
        'SCHEMA_MISMATCH',
        'Answer must carry the picked option ids in `correct_option_ids`',
      ),
    );
  }
  const expected = input.expectedAnswers as McAnswer;

  const submittedSet = new Set(submitted.correct_option_ids);
  const expectedSet = new Set(expected.correct_option_ids);

  const correctSelected = [...submittedSet].filter((id) => expectedSet.has(id));
  const wrongSelected = [...submittedSet].filter((id) => !expectedSet.has(id));
  const exactMatch = correctSelected.length === expectedSet.size && wrongSelected.length === 0;

  const allowPartial = input.checkSettings['allow_partial_credit'] === true;

  let score: number;
  if (exactMatch) {
    score = 100;
  } else if (allowPartial && expectedSet.size > 0) {
    // Penalise wrong picks: each wrong pick cancels one correct pick.
    score = Math.max(
      0,
      Math.round((100 * (correctSelected.length - wrongSelected.length)) / expectedSet.size),
    );
  } else {
    score = 0;
  }

  return Result.ok({
    correct: score === 100,
    score,
    details: {
      correct_selected: correctSelected,
      wrong_selected: wrongSelected,
      expected: [...expectedSet],
    },
    requiresReview: false,
  });
}

/**
 * The shape AJV used to guarantee.
 *
 * `multiple_choice` joined `OWN_SUBMISSION_SHAPE` on the rewrite, because the new key is a
 * map of correct option ids and the new submission is a list of picks with the attempt
 * each was made on. The old form's submission still had a schema, and dropping the check
 * along with it would have turned a client bug into `correct_option_ids: undefined`
 * crashing inside a `Set`.
 */
function readSubmission(answer: unknown): McAnswer | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null;
  const { correct_option_ids: ids } = answer as { correct_option_ids?: unknown };
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return null;
  // `minItems: 1` used to be AJV's, and it is worth keeping: an empty pick list is a
  // client that submitted nothing, which is a bug worth naming rather than an answer
  // worth marking zero.
  if (ids.length === 0) return null;
  return { correct_option_ids: ids as string[] };
}
