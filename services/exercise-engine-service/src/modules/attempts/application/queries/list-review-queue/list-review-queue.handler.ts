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
  /** Which exercise this submission belongs to — the only grouping a course inbox has. */
  exerciseId: string;
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
 * The queue of one or many exercises, judged by the same engine that routed it here.
 *
 * Each exercise definition is fetched once per page however many of its submissions are
 * on it, and one bad attempt does not take the page down with it: a submission the
 * validator cannot read comes back with `details: null` rather than a 500, because a
 * teacher who cannot open their queue has no way to unblock the learner in it. A whole
 * exercise that cannot be fetched costs its own submissions their diff and nothing more.
 */
@QueryHandler(ListReviewQueueQuery)
export class ListReviewQueueHandler implements IQueryHandler<ListReviewQueueQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(query: ListReviewQueueQuery): Promise<ListReviewQueueResult> {
    const { items, total } = await this.attempts.findAllByExercises(query.exerciseIds, {
      status: 'ROUTED_FOR_REVIEW',
      limit: query.limit,
      offset: query.offset,
    });

    if (items.length === 0) {
      return { items: [], total, limit: query.limit, offset: query.offset };
    }

    // One fetch per exercise on this page, not per submission: a queue is typically many
    // submissions of a few exercises, and the definition is the same for all of them.
    const definitions = new Map<string, ExerciseDefinition | null>();

    const entries: ReviewQueueEntry[] = [];
    for (const attempt of items) {
      const def = await this.definitionFor(attempt, definitions);
      entries.push({
        attemptId: attempt.id,
        userId: attempt.userId,
        exerciseId: attempt.exerciseId,
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

  /**
   * The exercise as its author left it, memoised for this page.
   *
   * Keyed by exercise and language, because the same exercise answered in two languages
   * is two different keys to draw a diff against.
   */
  private async definitionFor(
    attempt: Attempt,
    cache: Map<string, ExerciseDefinition | null>,
  ): Promise<ExerciseDefinition | null> {
    const key = `${attempt.exerciseId}:${attempt.targetLanguage}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const result = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      // The teacher's copy: the key is what the diff is drawn against.
      'PRACTICE',
    );
    const def = result.isFail ? null : result.value;
    cache.set(key, def);
    return def;
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
