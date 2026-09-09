import { Injectable } from '@nestjs/common';
import { analyse, fromPersisted } from '@ssz/shared-kernel/writing-task';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** What the client posts: the text, and which checklist items the student ticked. */
interface SubmittedText {
  text: string;
  ticked: string[];
}

/**
 * Handles `writing_task` — which, for this template alone, means never grading it.
 *
 * Every other validator here decides something. This one cannot, by construction: the
 * handoff's rule is that nothing about a student's text is graded automatically, and
 * there is no key to compare a whole text against. `requiresReview` is therefore
 * unconditional — not a fallback for an answer the machine could not place, but the
 * design.
 *
 * Until now that was expressed by membership of `FREE_FORM_CODES` in the dispatcher: the
 * template was routed without anything being computed, and the teacher opened the queue
 * with a wall of prose and a word count they had to take on trust. What this adds is the
 * *facts* — words, paragraphs, which must-cover points were phrased, which the student
 * ticked — from `@ssz/shared-kernel/writing-task`, the same `analyse` the builder's
 * tester and the runner's readout bar run, so the three cannot disagree about what the
 * text contains.
 *
 * Two things it deliberately does not put on the attempt:
 *
 * - the mark suggestions `analyse` can produce. With the AI stage unbuilt, marks start
 *   unset and the teacher's action stays disabled until every criterion is marked
 *   (IMPLEMENTATION.md's production rule, plan 50 §4). A suggestion stored on the
 *   attempt is a suggestion something will eventually pre-fill.
 * - a score. The teacher's marks are the score (plan 50 §3.2), and a number written here
 *   is one they would have to overwrite.
 *
 * The submission shape is unchanged from before the rewrite: `text` stays where it was,
 * so the review queue's `essayOf` and the whole inbox keep reading it (plan 50 §3.1).
 * `ticked` is new and is the student's own tracking — it never affects a verdict.
 */
@Injectable()
export class WritingTaskValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = readSubmission(input.submittedAnswer);
    if (submitted === null) {
      return Result.fail(
        new ValidationError('SCHEMA_MISMATCH', 'Answer must carry the written text in `text`'),
      );
    }

    const document = fromPersisted(
      // The envelope is the exercise row's business; none of it matters here.
      { id: '', moduleId: '', title: '', updatedAt: '' },
      input.content,
      input.expectedAnswers,
    );

    const analysis = analyse(document, submitted.text);
    const ticked = new Set(submitted.ticked);

    // Written for the teacher, not the learner: `hit` is derived from the point
    // keywords, which the student may not see. The submit handler forwards details
    // only for templates that have declared them learner-facing, and this is not one.
    const details = {
      // The queue's tally (plan 44 §0.3). A writing task is one item and the machine
      // passed none of it — stated rather than left to the handler's fallback, because
      // here it is the template's nature and not a missing number.
      totalItems: 1,
      passedItems: 0,
      wordCount: analysis.words,
      paragraphs: analysis.paragraphs,
      uniqueWords: analysis.uniqueWords,
      // Against the author's own range. Recorded rather than enforced: the runner locks
      // the submit button, and a text that arrives short anyway is a teacher's decision
      // to make, not a request to reject with the work inside it.
      length: analysis.length,
      hitCount: analysis.hitCount,
      neededCount: analysis.neededCount,
      points: analysis.cover.map((point) => ({
        id: point.id,
        text: point.text,
        required: point.required,
        /** A keyword for this point was phrased somewhere in the text. */
        hit: point.hit,
        /** The student ticked it off. Their own tracking, and often the more honest of the two. */
        ticked: ticked.has(point.id),
      })),
    };

    // No INVALID_EXERCISE branch, unlike its neighbours. They refuse an exercise with no
    // sentences because there is nothing to grade against; here the thing being graded is
    // the student's own text, and it is already written. Failing the submission because
    // the *exercise* is malformed would throw away the work to report the author's bug.
    return Result.ok<ValidationOutcome, ValidationError>({
      correct: false,
      score: 0,
      details,
      requiresReview: true,
    });
  }
}

/**
 * Read the submission defensively. `text` is the only field that must be there — a
 * client that sends no `ticked` has simply shown no checklist, which every mode with
 * `showPlan: false` does.
 */
function readSubmission(answer: unknown): SubmittedText | null {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return null;

  const { text, ticked } = answer as { text?: unknown; ticked?: unknown };
  if (typeof text !== 'string') return null;

  return {
    text,
    ticked: Array.isArray(ticked) ? ticked.filter((id): id is string => typeof id === 'string') : [],
  };
}
