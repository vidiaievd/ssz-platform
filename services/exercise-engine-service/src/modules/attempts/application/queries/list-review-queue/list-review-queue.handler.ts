import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListReviewQueueQuery } from './list-review-queue.query.js';
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
  type ExerciseDefinition,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';

/** One waiting submission, with the machine's reading of it recomputed for the teacher. */
export interface ReviewQueueEntry {
  attemptId: string;
  userId: string;
  templateCode: string;
  submittedAnswer: unknown;
  submittedAt: Date | null;
  timeSpentSeconds: number;
  selfChecksUsed: number;
  answersRevealed: boolean;
  /**
   * The validator's own breakdown — per item: verdict, similarity, the key it was compared
   * against, the diff and the guards it tripped. Unmasked: this is the teacher's copy.
   *
   * Recomputed rather than read back from the attempt. `routeForReview` stores no details,
   * and storing them would create a second answer to "how does this submission read"
   * that drifts the moment the author fixes a key.
   */
  details: unknown;
}

export interface ListReviewQueueResult {
  items: ReviewQueueEntry[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The queue of one exercise, judged by the same engine that routed it here.
 *
 * The exercise definition is fetched once for the whole page — every attempt in it is on
 * the same exercise — and one bad attempt does not take the page down with it: a
 * submission the validator cannot read comes back with `details: null` rather than a 500,
 * because a teacher who cannot open their queue has no way to unblock the learner in it.
 */
@QueryHandler(ListReviewQueueQuery)
export class ListReviewQueueHandler implements IQueryHandler<ListReviewQueueQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(query: ListReviewQueueQuery): Promise<ListReviewQueueResult> {
    const { items, total } = await this.attempts.findAllByExercise(query.exerciseId, {
      status: 'ROUTED_FOR_REVIEW',
      limit: query.limit,
      offset: query.offset,
    });

    if (items.length === 0) {
      return { items: [], total, limit: query.limit, offset: query.offset };
    }

    // One fetch for the page: every attempt in this queue is on the same exercise.
    const defResult = await this.contentClient.getExerciseForAttempt(
      query.exerciseId,
      items[0]!.targetLanguage,
      // The teacher's copy: the key is what the diff is drawn against.
      'PRACTICE',
    );
    const def = defResult.isFail ? null : defResult.value;

    const entries: ReviewQueueEntry[] = [];
    for (const attempt of items) {
      entries.push({
        attemptId: attempt.id,
        userId: attempt.userId,
        templateCode: attempt.templateCode,
        submittedAnswer: attempt.submittedAnswer,
        submittedAt: attempt.submittedAt,
        timeSpentSeconds: attempt.timeSpentSeconds,
        selfChecksUsed: attempt.selfChecksUsed,
        answersRevealed: attempt.answersRevealed,
        details: def === null ? null : await this.detailsFor(attempt, def),
      });
    }

    return { items: entries, total, limit: query.limit, offset: query.offset };
  }

  private async detailsFor(attempt: Attempt, def: ExerciseDefinition): Promise<unknown> {
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

    return validation.isFail ? null : validation.value.details;
  }
}
