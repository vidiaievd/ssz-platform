import { Injectable } from '@nestjs/common';
import {
  fromPersisted,
  gradeAttempt,
  isShortAnswerDocument,
} from '@ssz/shared-kernel/short-answer';
import type { GradedAnswer, Routing, SubmittedAnswer } from '@ssz/shared-kernel/short-answer';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';
import { gradeLegacyShortAnswer } from './short-answer-legacy.js';

/**
 * Grades `short_answer`: a set of open comprehension questions, judged by whether the
 * answer said the things it had to say.
 *
 * The key is semantic elements, not strings. Each element is one thing the answer must
 * say and carries two or three anchor phrases a student might say it with, and an
 * element is covered when one of its anchors turns up as a contiguous run of words. The
 * verdict per question follows from element coverage rather than from a similarity
 * score, which is the point: the breakdown is what the student and the teacher both read.
 *
 * The judgement comes from `@ssz/shared-kernel/short-answer`, the same module the
 * builder's tester and the runner's result card run, so the three cannot disagree about
 * whether an element was covered.
 *
 * Two document shapes reach this validator, and the shape decides which grader runs.
 * Plan 51 §8 Q1 leaves 144 exercises of the old single-question form live until the
 * catalogue is rewritten; `short-answer-legacy.ts` holds that path unchanged. Dispatching
 * on the document rather than on a version field is deliberate — those 144 were written
 * before any version existed, so a field could only ever be absent there.
 *
 * The client's own verdicts are never read. Each question was already graded once, by
 * `answer-question`, and the runner was told the result — but a submission is a request,
 * and the score, the routing and the queue's breakdown are all recomputed here from the
 * text and the current key.
 */
@Injectable()
export class ShortAnswerValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    if (!isShortAnswerDocument(input.content)) {
      return gradeLegacyShortAnswer(input);
    }

    const answers = readSubmittedAnswers(input.submittedAnswer);
    if (answers === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be a list of { questionId, text } — one entry per question answered',
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);
    if (document.questions.length === 0) {
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no questions'));
    }

    const outcome = gradeAttempt(document, answers);
    const routing = (answer: GradedAnswer): Routing =>
      routedToTeacher(document.settings.teacherReview, answer) ? 'teacher' : 'pass';

    const details = {
      totalItems: outcome.answers.length,
      routedItems: outcome.answers.filter((a) => routing(a) === 'teacher').length,
      // Questions the machine closed by itself — not questions that scored a `pass`.
      // Under `teacherReview: 'all'` every question goes to a person however well it was
      // answered, and the two numbers part company there. This one is the one the rest of
      // the system reads: `submit-answer` writes it onto the attempt as `autoPassedItems`,
      // which is what the queue's batch button offers and what `isMachineClean` re-checks
      // before approving. Counting verdicts here would have the hint promise a batch the
      // gate then refuses. The verdict tally the student's completion screen shows is
      // counted from `items[]` in the learner-facing projection instead.
      passedItems: outcome.answers.filter((a) => routing(a) === 'pass').length,
      // The percentage the queue shows beside the verdict, and the one the SRS consumer
      // routes on. Over elements rather than over questions (plan 51 §3.4).
      coveredElements: outcome.covered,
      totalElements: outcome.total,
      items: outcome.answers.map((answer) => toTeacherDetail(answer, routing(answer))),
    };

    if (outcome.requiresReview) {
      // A routed submission carries no score: the teacher's mark is the score, and a
      // number written now is one they would have to overwrite. The same rule the
      // translate and writing-task validators follow.
      return Result.ok<ValidationOutcome, ValidationError>({
        correct: false,
        score: 0,
        details,
        requiresReview: true,
      });
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: outcome.correct,
      score: outcome.score,
      details,
      requiresReview: false,
    });
  }
}

/**
 * Whether this question, on its own, goes to a person.
 *
 * `requiresReview` on the outcome answers it for the attempt as a whole; this answers it
 * per question, which is what the queue's rows and the student's routing line both read.
 * An answer nothing could grade — a question the author has since deleted — counts as
 * unclear rather than as passed: an answer no machine could place is exactly what a
 * person is for.
 */
function routedToTeacher(
  policy: 'all' | 'flagged' | 'none',
  answer: GradedAnswer,
): boolean {
  if (policy === 'none') return false;
  if (policy === 'all') return true;
  return answer.result === null || answer.result.verdict !== 'pass';
}

/**
 * One question as the teacher queue will read it: what was asked, what the student wrote,
 * how it was judged, and which of the things the answer had to say were said.
 *
 * The anchor that matched travels with each element, unmasked. That is the queue's whole
 * value over a wall of prose: a teacher looking at a `partial` needs to see that the
 * student wrote "når det er mørkt" and the key was listening for "i mørket", because the
 * fix is usually the key rather than the mark. None of it reaches the learner — the
 * submit handler forwards details only for the templates that declared them
 * learner-facing, and there `short_answer` is stripped down to verdicts.
 *
 * A question the document no longer holds is reported as itself rather than skipped. The
 * student answered something, and a row missing from the queue is an answer nobody reads.
 */
function toTeacherDetail(answer: GradedAnswer, routing: Routing) {
  const result = answer.result;

  return {
    itemId: answer.questionId,
    /** The question the student was given. Null only if the set changed under them. */
    prompt: answer.question?.prompt ?? null,
    submitted: answer.text,
    /** Null when the question is gone — the one case nothing can be said about. */
    verdict: result?.verdict ?? null,
    covered: result?.covered ?? 0,
    total: result?.total ?? 0,
    tooShort: result?.tooShort ?? false,
    words: result?.words ?? 0,
    elements:
      result?.hits.map((hit) => ({
        id: hit.id,
        label: hit.label,
        required: hit.required,
        hit: hit.anchor !== null,
        /** The phrase that matched. Teacher-only, and the reason this row is useful. */
        anchor: hit.anchor,
      })) ?? [],
    /** The author's own answer, for the teacher to mark against. */
    model: answer.question?.model ?? null,
    routing,
  };
}

/**
 * The submission is not checked by AJV before this: the template's answer schema
 * describes the author's key — questions with their elements — and one schema cannot
 * usefully describe both that and a list of typed answers. So the shape is checked here,
 * where a bad one is a client bug rather than a wrong answer.
 *
 * Both wire shapes are accepted, because the attempt API wraps the list and the older
 * clients send it bare.
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
    const { questionId, text } = raw as { questionId?: unknown; text?: unknown };
    if (typeof questionId !== 'string' || questionId === '') return null;
    out.push({ questionId, text: typeof text === 'string' ? text : '' });
  }
  return out;
}
