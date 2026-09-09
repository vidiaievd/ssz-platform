import { Injectable } from '@nestjs/common';
import {
  deliverableRows,
  fromPersisted,
  isSentenceSchemaDocument,
} from '@ssz/shared-kernel/sentence-schema';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import {
  gradeSubmittedRow,
  readSubmittedRows,
  scoreSet,
  type RowGrading,
} from '../../../shared/application/services/sentence-schema-rows.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/**
 * Grades `sentence_schema`: a set of sentences laid out on a topological field board.
 *
 * The judgement comes from `@ssz/shared-kernel/sentence-schema`, the same module the
 * builder's preview runs, so the two cannot disagree about whether a piece is in a field
 * that accepts it. One rule in there is worth naming because it is easy to implement
 * almost right: order inside a field is judged against the chunk's index in the sentence,
 * never against the field's own list, which is what makes `order: 'loose'` a one-flag
 * change rather than a second grader.
 *
 * The verdict is deterministic and `requiresReview` stays false. The type is not in
 * `REVIEWABLE_EXERCISE_TYPES` and should not be: a piece is either in a field the key
 * accepts or it is not, and there is nothing here for a teacher to decide.
 *
 * One document shape, not two. The rewrite carried a second grader for exactly one plan
 * phase; plan 52 §8 Q7 ended that by rewriting all seven seeded exercises. A document
 * that is not a set is now refused as an invalid exercise rather than graded by a second
 * path — the failure a student would otherwise get is a score of zero on an exercise
 * nobody can see is broken.
 *
 * The client's own verdicts are never read. Each sentence was already graded once, by
 * `check-row`, and the runner was told the marks — but a submission is a request, and the
 * score is recomputed here from the boards and the current key.
 */
@Injectable()
export class SentenceSchemaValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    if (!isSentenceSchemaDocument(input.content)) {
      return Result.fail(
        new ValidationError(
          'INVALID_EXERCISE',
          'This exercise is not a sentence set — its document predates the rewrite',
        ),
      );
    }

    const submitted = readSubmittedRows(input.submittedAnswer);
    if (submitted === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be a list of { rowId, placement } — one board per sentence answered',
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);
    const gradings = submitted
      .map((row) => gradeSubmittedRow(document, row))
      .filter((grading): grading is RowGrading => grading !== null);

    const allowPartial = input.checkSettings['allow_partial_credit'] !== false; // default true
    const score = scoreSet(document, gradings, allowPartial);

    const closed = gradings.filter((g) => g.solved && !g.revealed).length;

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: score === 100,
      score,
      details: {
        // The tally `submit-answer` writes onto the attempt as `autoPassedItems`, over
        // the sentences the student was given — the deliverable ones, which is what the
        // projection shipped — rather than the ones they handed in: a sentence never
        // attempted is part of the exercise, not absent from it.
        totalItems: deliverableRows(document).length,
        passedItems: closed,
        items: gradings.map((grading) => ({
          itemId: grading.rowId,
          solved: grading.solved,
          revealed: grading.revealed,
          score: grading.score,
          /** Marks, not the key: which pieces went wrong and how. */
          byItem: grading.marks.byItem,
          byField: grading.marks.byField,
          wrong: grading.marks.wrong,
          placed: grading.marks.placed,
          total: grading.marks.total,
        })),
      },
      requiresReview: false,
    });
  }
}
