import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReviewAttemptCommand } from './review-attempt.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  ANSWER_VALIDATOR,
  type IAnswerValidator,
} from '../../../../../shared/application/ports/answer-validator.port.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';

export type ReviewAttemptError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | ContentClientError
  | AttemptDomainError;

export interface ReviewAttemptResult {
  attemptId: string;
  status: 'SCORED' | 'RETURNED';
  score: number | null;
  approvedItems: number;
  totalItems: number;
}

/** What the machine had already closed by itself, per item. */
interface AutoOutcome {
  itemId: string;
  autoPassed: boolean;
}

/**
 * The teacher's verdict, and the score that follows from it.
 *
 * The score is not sent by the client. It is derived here from two things the server can
 * see: the items the auto-check closed on its own, and the decisions the teacher made
 * about the rest — so a client cannot award a mark, and two teachers making the same
 * decisions cannot produce two different marks.
 *
 * Items the teacher decided nothing about are not approved. The queue screen sends a
 * decision for every open item, so the case only arises when a submission changed under
 * the reviewer — and quietly counting an undecided sentence as right would be the one
 * mistake this template cannot afford, since being marked by a person is the whole
 * feedback the learner gets.
 */
@CommandHandler(ReviewAttemptCommand)
export class ReviewAttemptHandler implements ICommandHandler<ReviewAttemptCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: ReviewAttemptCommand,
  ): Promise<Result<ReviewAttemptResult, ReviewAttemptError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });

    if (command.outcome === 'returned') {
      const returned = attempt.review({
        reviewerId: command.reviewerId,
        outcome: 'returned',
        decisions: command.decisions,
        comment: command.comment,
      });
      if (returned.isFail) return Result.fail(returned.error as AttemptDomainError);

      await this.attempts.save(attempt);
      return Result.ok({
        attemptId: attempt.id,
        status: 'RETURNED',
        score: null,
        approvedItems: 0,
        totalItems: 0,
      });
    }

    const autoResult = await this.autoOutcomes(attempt);
    if (autoResult.isFail) return Result.fail(autoResult.error);
    const auto = autoResult.value;

    const decided = new Map(command.decisions.map((decision) => [decision.itemId, decision]));
    const approvedItems = auto.filter(
      (item) => item.autoPassed || decided.get(item.itemId)?.approved === true,
    ).length;
    const totalItems = auto.length;

    // An exercise with no readable items cannot be scored on a proportion of nothing;
    // the teacher's act of approving is then the whole verdict.
    const score = totalItems === 0 ? 100 : Math.round((approvedItems / totalItems) * 100);

    const reviewed = attempt.review({
      reviewerId: command.reviewerId,
      outcome: 'approved',
      decisions: command.decisions,
      comment: command.comment,
      score,
      // A submission a teacher has approved item by item passes on those items, not on a
      // threshold this service would have to invent for a template it cannot grade.
      passed: approvedItems > 0,
    });
    if (reviewed.isFail) return Result.fail(reviewed.error as AttemptDomainError);

    await this.attempts.save(attempt);
    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();

    return Result.ok({
      attemptId: attempt.id,
      status: 'SCORED',
      score,
      approvedItems,
      totalItems,
    });
  }

  /**
   * Which items the auto-check closed by itself, recomputed from the stored answer.
   *
   * The same call the queue makes, for the same reason: the attempt stores no breakdown,
   * and one that was stored at submission time would disagree with the exercise the
   * moment its author fixed a key.
   */
  private async autoOutcomes(attempt: Attempt): Promise<Result<AutoOutcome[], ReviewAttemptError>> {
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
}

/**
 * The per-item routing out of a validator's details.
 *
 * Read defensively: `details` is validator-specific by contract, and this handler is
 * written to serve every template that can reach a review queue rather than one of them.
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
