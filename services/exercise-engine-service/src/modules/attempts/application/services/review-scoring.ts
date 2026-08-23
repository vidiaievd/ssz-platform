import { Inject, Injectable } from '@nestjs/common';
import { scoreRubric } from '@ssz/shared-kernel/writing-task';
import type { RubricMarks, RubricOutcome, RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import {
  ANSWER_VALIDATOR,
  type IAnswerValidator,
} from '../../../../shared/application/ports/answer-validator.port.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  type ContentClientError,
} from '../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { Attempt, ReviewDecision } from '../../domain/entities/attempt.entity.js';

/** What the machine had already closed by itself, per item. */
export interface AutoOutcome {
  itemId: string;
  autoPassed: boolean;
}

/** A submission graded out of criteria rather than out of items (plan 50 §3.2). */
export interface RubricGrading {
  snapshot: RubricSnapshot;
  marks: RubricMarks;
}

/** The mark that follows from the machine's items plus the teacher's decisions. */
export interface ReviewScore {
  approvedItems: number;
  totalItems: number;
  /** 0–100, whichever way it was arrived at — the unit every other consumer reads. */
  score: number;
  /** The rubric total behind `score`, when a rubric is what produced it. */
  rubric: RubricOutcome | null;
}

/**
 * The arithmetic behind a verdict: what the machine closed, and what that plus the
 * teacher's decisions is worth.
 *
 * Shared by the single verdict (44.9) and the batch approval (44.10) so that the two
 * cannot disagree about what "machine-clean" means or what a submission scores. The
 * batch is the reason it has to be one implementation: the whole point of §0.3 is that a
 * batch recomputes the parse exactly as a single verdict does, and a second copy of this
 * would be a second answer to "is this submission still clean".
 */
@Injectable()
export class ReviewScoring {
  constructor(
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  /**
   * Which items the auto-check closes by itself, recomputed from the stored answer.
   *
   * The attempt stores no breakdown, and one stored at submission time would disagree
   * with the exercise the moment its author fixed a key — which is the case the batch
   * exists to catch rather than wave through (plan 44 §0.3).
   */
  async autoOutcomes(attempt: Attempt): Promise<Result<AutoOutcome[], ContentClientError>> {
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) return Result.fail(defResult.error);
    const def = defResult.value;

    const validation = await this.validator.validate({
      templateCode: attempt.templateCode,
      answerSchema: def.template.answerSchema as object,
      expectedAnswers: def.exercise.expectedAnswers,
      content: def.exercise.content,
      submittedAnswer: attempt.submittedAnswer,
      checkSettings: {
        ...(def.template.defaultCheckSettings ?? {}),
        ...(def.exercise.answerCheckSettings ?? {}),
      },
      targetLanguage: attempt.targetLanguage,
    });

    // A submission the validator cannot read still gets a verdict: the teacher's. Every
    // item then counts as one they decided, which is exactly what happened.
    if (validation.isFail) return Result.ok([]);

    return Result.ok(readItems(validation.value.details));
  }

  /**
   * The mark, derived on the server from two things it can see: the items the auto-check
   * closed, and the decisions the teacher made about the rest.
   *
   * Items the teacher decided nothing about are not approved *here*. That is a rule about
   * this function, not about what a verdict means: what an approval credits is decided by
   * its caller, which passes in one decision per item (`creditedByApproval` in
   * `review-attempt.handler.ts`). Keeping the silence unforgiving at this level is what
   * makes the crediting an explicit act rather than a default nobody can see — a score
   * that quietly counted whatever it was not told about would be the one mistake these
   * templates cannot afford.
   *
   * Pass `rubric` for the templates a person grades out of criteria; the item branch is
   * then not consulted at all. `approvedItems`/`totalItems` carry the rubric total and
   * its ceiling — the event's own words for them are "how much of the submission
   * counted", and for an essay that is 11 of 15, not 1 of 1.
   */
  scoreOf(
    auto: AutoOutcome[],
    decisions: ReviewDecision[],
    rubric?: RubricGrading | null,
  ): ReviewScore {
    // An essay is not a set of items: one mark 0-3 per criterion, `Σ mark × weight`
    // against the rubric the submission was queued with. The total is reported in both
    // units — in rubric points, which is what the learner's card and the teacher's
    // button say, and as a percentage, because `score` is read by the SRS, which fails
    // anything under 60 (`exercise-attempted.consumer.ts`). A pass worth 11 of 15 that
    // travelled as `11` would lengthen intervals as if the student had failed.
    if (rubric) {
      const outcome = scoreRubric(rubric.snapshot, rubric.marks);
      return {
        approvedItems: outcome.points,
        totalItems: outcome.max,
        score: outcome.percent,
        rubric: outcome,
      };
    }

    const decided = new Map(decisions.map((decision) => [decision.itemId, decision]));
    const approvedItems = auto.filter(
      (item) => item.autoPassed || decided.get(item.itemId)?.approved === true,
    ).length;
    const totalItems = auto.length;

    // An exercise with no readable items cannot be scored on a proportion of nothing;
    // the teacher's act of approving is then the whole verdict.
    const score = totalItems === 0 ? 100 : Math.round((approvedItems / totalItems) * 100);

    return { approvedItems, totalItems, score, rubric: null };
  }
}

/**
 * Nothing was left for a person: every item the parse reports was closed by the machine.
 *
 * An empty breakdown is not clean. A free-form submission — `writing_task`, whose
 * validator reports no items at all by design — has had no machine judgement passed on
 * it, and a batch that swept those through would be approving work nobody read.
 */
export function isMachineClean(auto: AutoOutcome[]): boolean {
  return auto.length > 0 && auto.every((item) => item.autoPassed);
}

/**
 * The per-item routing out of a validator's details.
 *
 * Read defensively: `details` is validator-specific by contract, and this is written to
 * serve every template that can reach a review queue rather than one of them.
 */
function readItems(details: unknown): AutoOutcome[] {
  if (typeof details !== 'object' || details === null) return [];
  const items = (details as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((entry): AutoOutcome[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const itemId = (entry as { itemId?: unknown }).itemId;
    if (typeof itemId !== 'string') return [];
    const routing = (entry as { routing?: unknown }).routing;
    return [{ itemId, autoPassed: routing === 'pass' }];
  });
}
