import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';

interface ItemEntry {
  id: string;
  correct_option_ids: string[];
  explanation?: string;
}

interface McGroupAnswer {
  items: ItemEntry[];
}

interface ItemResult {
  item_id: string;
  correct: boolean;
  /** What the learner picked; empty when the question was left unanswered. */
  submitted: string[];
  expected: string[];
  explanation?: string;
}

const sameSet = (a: string[], b: string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
};

/**
 * The old `multiple_choice_group`: `items[]`, each question free to carry its own
 * options, and a key that is an array of option ids per item.
 *
 * Lifted out of the validator unchanged when the template was rewritten to the design
 * handoff (plan 54). Only two seeded exercises are written this way — the whole catalogue
 * of this type before the rewrite — and phase 3 rewrites both: one into the new form, one
 * into a `multiple_choice` set, because its per-row options are not a `multiple_choice_group`
 * at all under the handoff's model (plan 54 §8 Q1). Until then this path keeps them
 * playable, and the engine picks between the two graders by the shape of the document.
 *
 * Its own behaviour, unchanged: each question is right or wrong on its own — no half
 * credit inside a question, since picking one of two options either matches the key or
 * does not — and the block's score is the share of questions answered right. Questions
 * the learner skipped count as wrong, so the score always speaks for the whole block.
 * `allow_partial_credit` (default true, from the template's `defaultCheckSettings`) is
 * read here and nowhere else: the new form's pass mark is `settings.passThreshold` on the
 * document, where the author set it (plan 54 §3.4, Q3).
 */
export function gradeLegacyMultipleChoiceGroup(input: {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  checkSettings: Record<string, unknown>;
}): Result<ValidationOutcome, ValidationError> {
  const submitted = readSubmission(input.submittedAnswer);
  if (submitted === null) {
    return Result.fail(
      new ValidationError(
        'SCHEMA_MISMATCH',
        'Answer must carry one `{ id, correct_option_ids }` entry per question in `items`',
      ),
    );
  }
  const expected = input.expectedAnswers as McGroupAnswer;
  const allowPartial = input.checkSettings['allow_partial_credit'] !== false; // default true

  const submittedById = new Map(
    submitted.items.map((item) => [item.id, item.correct_option_ids]),
  );

  const itemResults: ItemResult[] = expected.items.map((item) => {
    const picks = submittedById.get(item.id) ?? [];
    return {
      item_id: item.id,
      correct: picks.length > 0 && sameSet(picks, item.correct_option_ids),
      submitted: picks,
      expected: item.correct_option_ids,
      ...(item.explanation ? { explanation: item.explanation } : {}),
    };
  });

  const correctCount = itemResults.filter((r) => r.correct).length;
  const totalCount = itemResults.length;

  let score: number;
  if (totalCount === 0) {
    score = 100;
  } else if (allowPartial) {
    score = Math.round((100 * correctCount) / totalCount);
  } else {
    score = correctCount === totalCount ? 100 : 0;
  }

  return Result.ok({
    correct: score === 100,
    score,
    details: { items: itemResults },
    requiresReview: false,
  });
}

/**
 * The shape AJV used to guarantee.
 *
 * `multiple_choice_group` joined `OWN_SUBMISSION_SHAPE` on the rewrite, because the new
 * key is a map of column ids per row with the author's line beside it and the new
 * submission is a map of picks. The old form's submission was describable by the same
 * schema as its key, and dropping the check along with AJV would have turned a client bug
 * into `items` being `undefined` inside a `map`. So it moved here rather than nowhere —
 * the same thing plan 53 did for `multiple_choice`.
 */
function readSubmission(answer: unknown): McGroupAnswer | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null;
  const { items } = answer as { items?: unknown };
  if (!Array.isArray(items)) return null;

  const out: ItemEntry[] = [];
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { id, correct_option_ids: ids } = raw as { id?: unknown; correct_option_ids?: unknown };
    if (typeof id !== 'string' || id === '') return null;
    if (!Array.isArray(ids) || ids.some((one) => typeof one !== 'string')) return null;
    out.push({ id, correct_option_ids: ids as string[] });
  }
  // `minItems: 1` used to be AJV's, and it is worth keeping: an empty item list is a
  // client that submitted nothing, which is a bug worth naming rather than an answer
  // worth marking zero.
  if (out.length === 0) return null;
  return { items: out };
}
