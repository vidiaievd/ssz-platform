import { Injectable } from '@nestjs/common';
import { completePairs, fromPersisted, grade } from '@ssz/shared-kernel/match-pairs';
import type { PairResult, Placement } from '@ssz/shared-kernel/match-pairs';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** What the client posts: which half it attached to which left half. */
interface SubmittedPlacements {
  placements: Placement[];
}

/**
 * Grades `match_pairs`.
 *
 * Like `word_bank_gap_fill`, this validator has to be told the exercise content, because
 * this template stores each pair whole: `content.pairs[].right` is the answer, and the
 * expected-answers column holds only the explanations. Both are read through the same
 * `@ssz/shared-kernel` module the builder runs, so that AC-X1 — client and server reach
 * the same verdict on the same document — holds by construction.
 *
 * Partial submission is legal and deliberate (BEHAVIOR §2.2): a student who has matched
 * three of five learns most from checking those three. So the score is counted against
 * every complete pair in the exercise, not against the length of what was sent — a
 * single correct placement out of five is 20%, not 100%.
 */
@Injectable()
export class MatchPairsValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const placements = readPlacements(input.submittedAnswer);
    if (placements === null) {
      return Result.fail(
        new ValidationError('SCHEMA_MISMATCH', 'Answer must carry a list of pair placements'),
      );
    }

    const document = fromPersisted(
      // The envelope is the exercise row's business; grading needs none of it.
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      input.content,
      input.expectedAnswers,
    );

    const total = completePairs(document).length;
    if (total === 0) {
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no pairs to match'));
    }

    const results = grade(document, placements);
    const correctCount = results.filter((result) => result.correct).length;
    const allCorrect = correctCount === total;
    const partialCredit = input.checkSettings['allow_partial_credit'] === true;

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: allCorrect,
      score: allCorrect ? 100 : partialCredit ? Math.round((correctCount / total) * 100) : 0,
      details: {
        totalPairs: total,
        correctPairs: correctCount,
        // Per filled slot: right or wrong, and why. Never which half was correct —
        // that is the reveal endpoint's job, and the whole point of keeping it a
        // separate action is that being wrong does not hand the answer over.
        // Slots the student left empty are absent entirely: unanswered, not wrong.
        pairs: results.map(toDetail),
      },
      requiresReview: false,
    });
  }
}

function toDetail(result: PairResult): {
  pairId: string;
  correct: boolean;
  explanation: string | null;
} {
  return { pairId: result.pairId, correct: result.correct, explanation: result.explanation };
}

/**
 * The submission is not checked by AJV before this: the template's answer schema
 * describes the author's feedback matrix, and one schema cannot usefully describe both
 * that and a list of placements. So the shape is checked here, where a bad one is a
 * client bug rather than a wrong answer.
 */
function readPlacements(submitted: unknown): Placement[] | null {
  if (typeof submitted !== 'object' || submitted === null) return null;
  const { placements } = submitted as Partial<SubmittedPlacements>;
  if (!Array.isArray(placements)) return null;

  const out: Placement[] = [];
  for (const raw of placements) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { pairId, rightId } = raw as Partial<Placement>;
    if (typeof pairId !== 'string' || typeof rightId !== 'string') return null;
    out.push({ pairId, rightId });
  }
  return out;
}
