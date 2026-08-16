import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListReviewQueueV2Query, type ReviewQueueGrouping } from './list-review-queue-v2.query.js';
import { encodeReviewQueueCursor } from './review-queue-cursor.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  REVIEW_CLAIM_TTL_MS,
  type Attempt,
  type ExercisePathSnapshot,
} from '../../../domain/entities/attempt.entity.js';

/** Another teacher has this one open — advisory, and gone on its own after 15 minutes. */
export interface ReviewQueueLock {
  teacherId: string;
  expiresAt: Date;
}

export interface ReviewQueueItem {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  groupId: string | null;
  containerId: string | null;
  /** Course · module · exercise as they read when the learner started (§0.3). */
  path: ExercisePathSnapshot | null;
  submittedAt: Date;
  /** Which try this is after a returned verdict — `revisionCount + 1`. */
  attemptNo: number;
  /**
   * The machine closed every item on its own. A hint for the list only: a verdict, single
   * or batch, recomputes the parse before acting on it, and a submission that stopped
   * being clean since (the author fixed a key) is skipped there rather than passed here.
   */
  autoClean: boolean;
  lock: ReviewQueueLock | null;
}

export interface ReviewQueueGroup {
  /** The exercise or the learner, depending on `kind`. */
  key: string;
  kind: ReviewQueueGrouping;
  /** Null when grouping by learner: their submissions span exercises and courses. */
  exerciseId: string | null;
  containerId: string | null;
  path: ExercisePathSnapshot | null;
  count: number;
  /**
   * Every submission time in the group, not an aggregate: the age histogram on the
   * teacher's screen cannot be rebuilt from a min and a mean.
   */
  submittedAt: Date[];
  autoCleanIds: string[];
  items: ReviewQueueItem[];
}

export interface ListReviewQueueV2Result {
  /** The whole scope, not this page — what the sidebar badge counts. */
  summary: { pending: number; oldestSubmittedAt: Date | null };
  groups: ReviewQueueGroup[];
  nextCursor: string | null;
}

/**
 * The teacher's queue over a scope, grouped for the screen.
 *
 * Grouping is done over the page rather than in SQL, and the page is ordered oldest
 * first — which is what makes the two orderings the spec asks for fall out for free:
 * groups appear in the order their oldest member does, and members inside a group stay
 * oldest-first. A group large enough to straddle a page boundary comes back in two
 * pieces under the same `key`; the caller appends rather than replaces.
 *
 * Nothing here calls the validator. That is the whole point of the counters snapshotted
 * at routing time: a page of fifty submissions used to be fifty parses and a content
 * fetch per exercise, for a list that shows none of it.
 */
@QueryHandler(ListReviewQueueV2Query)
export class ListReviewQueueV2Handler implements IQueryHandler<ListReviewQueueV2Query> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: ListReviewQueueV2Query): Promise<ListReviewQueueV2Result> {
    const now = new Date();

    // One row beyond the page, only to learn whether there is a next one — a count over
    // the scope would answer a different question, since rows leave the queue as verdicts
    // land.
    const [rows, summary] = await Promise.all([
      this.attempts.findReviewQueuePage(query.scope, {
        limit: query.limit + 1,
        after: query.after,
      }),
      this.attempts.summariseReviewQueue(query.scope),
    ]);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const groups = new Map<string, ReviewQueueGroup>();
    for (const attempt of page) {
      const item = this.toItem(attempt, now);
      const key = query.groupBy === 'exercise' ? attempt.exerciseId : attempt.userId;

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          kind: query.groupBy,
          exerciseId: query.groupBy === 'exercise' ? attempt.exerciseId : null,
          containerId: query.groupBy === 'exercise' ? attempt.containerId : null,
          path: query.groupBy === 'exercise' ? attempt.exercisePath : null,
          count: 0,
          submittedAt: [],
          autoCleanIds: [],
          items: [],
        };
        groups.set(key, group);
      }

      group.count += 1;
      group.submittedAt.push(item.submittedAt);
      if (item.autoClean) group.autoCleanIds.push(item.attemptId);
      group.items.push(item);
    }

    const last = page.at(-1);
    return {
      summary,
      groups: [...groups.values()],
      nextCursor:
        hasMore && last?.submittedAt
          ? encodeReviewQueueCursor({ submittedAt: last.submittedAt, id: last.id })
          : null,
    };
  }

  private toItem(attempt: Attempt, now: Date): ReviewQueueItem {
    return {
      attemptId: attempt.id,
      userId: attempt.userId,
      exerciseId: attempt.exerciseId,
      templateCode: attempt.templateCode,
      groupId: attempt.groupId,
      containerId: attempt.containerId,
      path: attempt.exercisePath,
      // The repository only returns rows that have one; the fallback keeps the type
      // honest without inventing a plausible-looking time.
      submittedAt: attempt.submittedAt ?? attempt.startedAt,
      attemptNo: attempt.revisionCount + 1,
      autoClean: this.isAutoClean(attempt),
      lock: this.lockOf(attempt, now),
    };
  }

  /**
   * Both counters must be there and agree. An attempt routed before 44.5 has neither, and
   * "no information" is not "the machine closed it" — the safe reading is that a person
   * still has to look.
   */
  private isAutoClean(attempt: Attempt): boolean {
    const { autoPassedItems, totalItems } = attempt;
    if (autoPassedItems === null || totalItems === null) return false;
    return totalItems > 0 && autoPassedItems === totalItems;
  }

  private lockOf(attempt: Attempt, now: Date): ReviewQueueLock | null {
    if (attempt.reviewClaimedBy === null || attempt.reviewClaimedAt === null) return null;

    const expiresAt = new Date(attempt.reviewClaimedAt.getTime() + REVIEW_CLAIM_TTL_MS);
    if (expiresAt <= now) return null;

    return { teacherId: attempt.reviewClaimedBy, expiresAt };
  }
}
