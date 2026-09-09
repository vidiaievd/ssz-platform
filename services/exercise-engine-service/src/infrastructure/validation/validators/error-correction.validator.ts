import { Injectable } from '@nestjs/common';
import { fromPersisted, judge, readEdits, route } from '@ssz/shared-kernel/error-correction';
import type { Item, Judgement, Routing, StudentEdits } from '@ssz/shared-kernel/error-correction';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/** What the client posts: the edits it made to each item, keyed by item id. */
interface SubmittedEdits {
  items: Record<string, unknown>;
}

/**
 * Grades `error_correction`, and — the part that makes this template different from
 * every other one here — decides that it usually *cannot* grade it.
 *
 * The design handoff's rule is that the auto-check may only ever approve: an answer
 * identical to the answer key passes, and everything else, a single typo included, is a
 * suggestion to the teacher rather than a rejection. A wrong sentence in error
 * correction is not evidence of not knowing; it is frequently a second correct sentence
 * the author did not think of, and a machine that marks those wrong teaches students to
 * write the sentence they think it wants.
 *
 * So `requiresReview` is true for anything short of a pass, and the attempt is routed
 * rather than scored. Nothing in here can return "wrong".
 *
 * The judgement itself comes from `@ssz/shared-kernel`, the same module the builder's
 * tester and the student's self-check run, so the three cannot disagree about what
 * counts as one mistake.
 */
@Injectable()
export class ErrorCorrectionValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = readSubmission(input.submittedAnswer);
    if (submitted === null) {
      return Result.fail(
        new ValidationError('SCHEMA_MISMATCH', 'Answer must carry the edits made to each item'),
      );
    }

    const document = fromPersisted(
      // The envelope is the exercise row's business; grading needs none of it.
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      input.content,
      input.expectedAnswers,
    );

    const items = document.items.filter((item) => item.wrong.trim() !== '');
    if (items.length === 0) {
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no sentences'));
    }

    const judged = items.map((item) => {
      const judgement = judge(document.check, item, submitted[item.id]);
      return {
        item,
        edits: submitted[item.id],
        judgement,
        // Kept per item rather than recomputed: the review queue credits a learner for
        // every sentence the check closed on its own, and it reads that off this field.
        routing: route(document.check, judgement),
      };
    });

    // An exercise routed to a teacher carries no score: the teacher's mark is the
    // score, and a number written now is one the teacher would have to overwrite.
    const routed = judged.filter(({ routing }) => routing === 'teacher');
    const spanTotal = judged.reduce((sum, { judgement }) => sum + judgement.spanCount, 0);
    const fixedTotal = judged.reduce((sum, { judgement }) => sum + judgement.fixedCount, 0);

    // For the teacher, not the learner: the handler forwards details only for templates
    // that have declared them learner-facing, and this one has not.
    const details = {
      totalItems: items.length,
      routedItems: routed.length,
      passedItems: items.length - routed.length,
      totalSpans: spanTotal,
      fixedSpans: fixedTotal,
      items: judged.map(({ item, edits, judgement, routing }) =>
        toTeacherDetail(item, edits, judgement, routing),
      ),
    };

    if (routed.length > 0) {
      return Result.ok<ValidationOutcome, ValidationError>({
        correct: false,
        score: 0,
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
 * One item as the teacher queue will read it: the verdict, what the student's edits
 * produced, which mistakes they reached, and what they changed where there was no
 * mistake. The edits themselves are kept rather than only the built sentence — the
 * whole reason the answer is stored as edits is that "which mistake did they find?"
 * cannot be recovered from a rewritten sentence.
 */
function toTeacherDetail(
  item: Item,
  edits: StudentEdits | undefined,
  judgement: Judgement,
  routing: Routing,
) {
  return {
    itemId: item.id,
    verdict: judgement.verdict,
    /** The faulty sentence the student was given — what they were asked to repair. */
    prompt: item.wrong,
    /** The author's aside to whoever marks this. Never sent to a learner. */
    note: item.teacherNote ?? null,
    // What the check did with this sentence by itself. The review handler credits a
    // `pass` without asking the teacher, exactly as it does for translate.
    routing,
    similarity: Number(judgement.sim.toFixed(3)),
    built: judgement.built,
    fixedSpans: judgement.fixedCount,
    totalSpans: judgement.spanCount,
    spans: judgement.spans.map((span) => ({
      key: span.key,
      type: span.type,
      state: span.state,
      wrong: span.wrong,
      fix: span.fix,
      submitted: span.localFix,
      note: span.note,
    })),
    stray: judgement.stray,
    edits: edits ?? null,
  };
}

/**
 * The submission is not checked by AJV before this: the template's answer schema
 * describes the author's answer key, and one schema cannot usefully describe both that
 * and a set of edits. So the shape is checked here, where a bad one is a client bug
 * rather than a wrong answer.
 */
function readSubmission(submitted: unknown): Record<string, StudentEdits> | null {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) return null;

  const { items } = submitted as Partial<SubmittedEdits>;
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;

  const out: Record<string, StudentEdits> = {};
  for (const [itemId, raw] of Object.entries(items)) {
    out[itemId] = readEdits(raw);
  }
  return out;
}
