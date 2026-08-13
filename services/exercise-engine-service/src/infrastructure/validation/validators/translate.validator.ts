import { Injectable } from '@nestjs/common';
import {
  fromPersisted,
  gradeSubmission,
  isTranslateCode,
  readSubmission,
  runItems,
} from '@ssz/shared-kernel/translate';
import type { ItemOutcome, TranslateType } from '@ssz/shared-kernel/translate';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/**
 * Grades `translate_to_target` / `translate_from_target` — which, like `error_correction`,
 * mostly means deciding that it cannot grade them.
 *
 * The handoff's rule for this template is the strictest of the three: the auto-check may
 * only ever approve. A translation that misses the key by a word is very often a second
 * correct translation the author never wrote down, and there is no mechanical test that
 * separates those from mistakes. So a hit on a variant of the key closes the item, and
 * every other verdict — a single typo included — is a diff and a sort order for a teacher.
 *
 * Until this existed, the two codes sat in `FREE_FORM_CODES` and returned
 * `correct: false, score: 0, requiresReview: true` for *every* answer, a word-perfect one
 * included. The judgement now comes from `@ssz/shared-kernel/translate`, the same module
 * the builder's tester and the student's self-check run, so the three cannot disagree
 * about what was accepted.
 */
@Injectable()
export class TranslateValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const answers = readSubmittedAnswers(input.submittedAnswer);
    if (answers === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be a list of { itemId, text } — one entry per sentence',
        ),
      );
    }

    const document = fromPersisted(
      // The envelope is the exercise row's business; grading needs none of it.
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      code(input.templateCode),
      input.content,
      input.expectedAnswers,
    );

    // `single` renders the first sentence and ignores the rest, so grading the rest would
    // fail the student on sentences they were never shown.
    const items = runItems(document);
    if (items.length === 0) {
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no sentences'));
    }

    const outcomes = gradeSubmission({ items, check: document.check }, answers);
    const routed = outcomes.filter((outcome) => outcome.routing === 'teacher');

    const details = {
      totalItems: items.length,
      routedItems: routed.length,
      passedItems: outcomes.length - routed.length,
      items: outcomes.map((outcome) => toTeacherDetail(outcome, answers[outcome.itemId] ?? '')),
    };

    // An exercise routed to a teacher carries no score: the teacher's mark is the score,
    // and a number written now is one the teacher would have to overwrite.
    if (routed.length > 0) {
      return Result.ok<ValidationOutcome, ValidationError>({
        correct: false,
        score: 0,
        // For the teacher, not the learner: `ref` is the answer key, and the handler
        // forwards details only for templates that have declared them learner-facing.
        details,
        requiresReview: true,
      });
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: true,
      score: 100,
      details,
      requiresReview: false,
    });
  }
}

/**
 * One sentence as the teacher queue will read it: what the student wrote, how it was
 * judged, the variant it was judged against, and the rules of the task it broke.
 *
 * The diff travels unmasked — masking is the student's projection, and the point of the
 * queue is to see the divergence.
 */
function toTeacherDetail(outcome: ItemOutcome, submitted: string) {
  return {
    itemId: outcome.itemId,
    verdict: outcome.verdict,
    similarity: Number(outcome.sim.toFixed(3)),
    ref: outcome.ref,
    submitted,
    tokens: outcome.tokens,
    missing: outcome.missing,
    banned: outcome.banned,
    routing: outcome.routing,
  };
}

/**
 * A mixed set is stored under `translate_to_target`, so the stored code is only ever a
 * fallback for `content.dir` — and `dir` changes nothing this validator decides. It is
 * threaded through anyway so that a document read here reads the same as one read
 * anywhere else.
 */
const code = (templateCode: string | undefined): TranslateType =>
  isTranslateCode(templateCode) ? templateCode : 'translate_to_target';

/**
 * The submission is not checked by AJV before this: the template's answer schema
 * describes the author's key — sentences with their accepted translations — and one schema
 * cannot usefully describe both that and a list of typed answers. So the shape is checked
 * here, where a bad one is a client bug rather than a wrong answer.
 *
 * Both wire shapes of the kernel are accepted, because the attempt API and the self-check
 * endpoint wrap the same list differently.
 */
function readSubmittedAnswers(submitted: unknown): Record<string, string> | null {
  const list = Array.isArray(submitted)
    ? submitted
    : typeof submitted === 'object' && submitted !== null
      ? (submitted as { answers?: unknown }).answers
      : undefined;

  if (!Array.isArray(list)) return null;
  return readSubmission(list);
}
