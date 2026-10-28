import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListMyMistakesQuery } from './list-my-mistakes.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';

export interface MyMistakeEntry {
  attemptId: string;
  exerciseId: string;
  /** For the row's icon, and to say what kind of task it was. */
  templateCode: string;
  targetLanguage: string;
  containerId: string;
  /**
   * The unit the exercise sits in — where the runner is opened from. From the attempt's
   * snapshot, else from where content places the exercise now; null when it is in no unit
   * any more, or content could not say.
   */
  unitId: string | null;
  /** The exercise's title as it read when the learner started. */
  exerciseTitle: string | null;
  score: number | null;
  /** When the failing answer was scored. */
  attemptedAt: Date;
}

export interface ListMyMistakesResult {
  items: MyMistakeEntry[];
  /** Every exercise with an uncorrected mistake, not only the page. */
  total: number;
}

/**
 * «Exercises with mistakes» on the phone's Practice tab (VoxOrd mobile redesign 05, step 8).
 *
 * A mistake is an exercise whose latest machine-scored attempt did not pass. Answering it
 * right makes that the latest attempt, so the exercise leaves the list without anything to
 * mark. Free-form work a reviewer judged is not here: a returned piece of work already has
 * its own place on «Today».
 *
 * Never the answer, the key or per-item detail — the fields are mapped one by one.
 */
@QueryHandler(ListMyMistakesQuery)
export class ListMyMistakesHandler implements IQueryHandler<ListMyMistakesQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
  ) {}

  async execute(query: ListMyMistakesQuery): Promise<ListMyMistakesResult> {
    const { attempts, total } = await this.attempts.findLatestMistakes(query.userId, {
      courseId: query.courseId,
      limit: query.limit,
    });
    const items = await Promise.all(attempts.map((attempt) => this.toEntry(attempt)));
    return { items, total };
  }

  private async toEntry(attempt: Attempt): Promise<MyMistakeEntry> {
    return {
      attemptId: attempt.id,
      exerciseId: attempt.exerciseId,
      templateCode: attempt.templateCode,
      targetLanguage: attempt.targetLanguage,
      // The repository selects only attempts made in a course.
      containerId: attempt.containerId as string,
      unitId: await this.unitOf(attempt),
      exerciseTitle: attempt.exercisePath?.exercise ?? null,
      score: attempt.scoreValue,
      attemptedAt: attempt.scoredAt as Date,
    };
  }

  /** Attempts started before the snapshot kept `moduleId` ask content (cached in Redis). */
  private async unitOf(attempt: Attempt): Promise<string | null> {
    const snapshot = attempt.exercisePath?.moduleId;
    if (snapshot) return snapshot;
    const placement = await this.content.getExercisePlacement(attempt.exerciseId);
    return placement.isOk ? placement.value.moduleId : null;
  }
}
