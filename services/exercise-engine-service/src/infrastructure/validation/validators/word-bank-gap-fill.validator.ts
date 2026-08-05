import { Injectable } from '@nestjs/common';
import { fromPersisted, gaps, grade } from '@ssz/shared-kernel/wordbank-gapfill';
import type { GapResult, Placement } from '@ssz/shared-kernel/wordbank-gapfill';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** What the client posts: where it put each word. */
interface SubmittedPlacements {
  placements: Placement[];
}

/**
 * Grades `word_bank_gap_fill` — and it is the only validator here that has to be told
 * the exercise content, because this template stores each sentence solved: the answer
 * is a token inside `content.sentences[].text`, not a separate key.
 *
 * The comparison and the explanation lookup both come from `@ssz/shared-kernel`, the
 * same module the builder runs. That is not tidiness: AC-X1 requires the client and the
 * server to reach the same verdict on the same document, and two implementations of
 * "is this the right word" drift the first time one of them learns about æ ø å.
 */
@Injectable()
export class WordBankGapFillValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const placements = readPlacements(input.submittedAnswer);
    if (placements === null) {
      return Result.fail(
        new ValidationError('SCHEMA_MISMATCH', 'Answer must carry a list of gap placements'),
      );
    }

    const document = fromPersisted(
      // The envelope is the exercise row's business; grading needs none of it.
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      input.content,
      input.expectedAnswers,
    );

    const total = gaps(document).length;
    if (total === 0) {
      return Result.fail(
        new ValidationError('INVALID_EXERCISE', 'Exercise has no gaps to answer'),
      );
    }

    const results = grade(document, placements);
    const correctCount = results.filter((result) => result.correct).length;
    const allCorrect = correctCount === total;
    const partialCredit = input.checkSettings['allow_partial_credit'] === true;

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: allCorrect,
      score: allCorrect ? 100 : partialCredit ? Math.round((correctCount / total) * 100) : 0,
      details: {
        totalGaps: total,
        correctGaps: correctCount,
        // Per gap: right or wrong, and why. Never the answer — that is the reveal
        // endpoint's job, and the whole point of keeping it a separate action is
        // that being wrong does not hand the word over.
        gaps: results.map(toDetail),
      },
      requiresReview: false,
    });
  }
}

function toDetail(result: GapResult): { gapKey: string; correct: boolean; explanation: string | null } {
  return { gapKey: result.gapKey, correct: result.correct, explanation: result.explanation };
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
    const { gapKey, word } = raw as Partial<Placement>;
    if (typeof gapKey !== 'string' || typeof word !== 'string') return null;
    out.push({ gapKey, word });
  }
  return out;
}
