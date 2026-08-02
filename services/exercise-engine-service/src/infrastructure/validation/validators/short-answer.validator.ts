import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';
import { checkShortAnswer, type ShortAnswerKey } from './short-answer-diff.js';

interface ShortAnswerSubmission {
  text: string;
}

/**
 * Open answers, graded as far as a machine honestly can.
 *
 * Transformation tasks (indirect speech, passive, inversion) have one intended
 * rewrite, so the submission is aligned against the closest accepted answer
 * word by word: an exact match scores instantly, a near miss is marked wrong
 * with the offending words named in `details`, and only an answer that is
 * nowhere near the key still goes to human / LLM review — it may be a valid
 * phrasing the author never listed, and marking that wrong would be worse than
 * making the learner wait.
 */
@Injectable()
export class ShortAnswerValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as ShortAnswerSubmission;
    const expected = input.expectedAnswers as ShortAnswerKey;

    const text = submitted.text ?? '';
    const diff = checkShortAnswer(expected, text);

    if (diff.ok === true && !this.passesCaseGate(expected, text, input.checkSettings)) {
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
   * The diff itself always compares case-insensitively — a wrong ending has to
   * be findable whatever the learner capitalised. Exercises that opt into
   * `case_sensitive` get their exact match re-checked literally here.
   */
  private passesCaseGate(
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
}
