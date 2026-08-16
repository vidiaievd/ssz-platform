import type {
  ReviewQueueCursor,
  ReviewQueueScope,
} from '../../../domain/repositories/attempt.repository.js';

export type ReviewQueueGrouping = 'exercise' | 'student';

/**
 * Everything waiting on a person across a scope — one school, narrowed by the groups a
 * teacher has or the courses they own (plan 44 §44.6).
 *
 * Replaces `ListReviewQueueQuery`, which asked by an explicit list of exercise ids. That
 * list was the BFF walking a whole course tree before it could draw an inbox, and it
 * could not express "everything my students handed in" at all. Here the caller names the
 * area it has already been authorised for, and the engine — which snapshots school,
 * course and group on the attempt since 44.3 — can answer it directly.
 *
 * No parse is computed: the queue is a list, and the validator's reading of a submission
 * belongs to the screen that opens one (44.7). `autoPassedItems`/`totalItems`, written
 * when the attempt routed here, stand in as the hint the list needs.
 */
export class ListReviewQueueV2Query {
  constructor(
    public readonly scope: ReviewQueueScope,
    public readonly groupBy: ReviewQueueGrouping,
    public readonly limit: number,
    public readonly after: ReviewQueueCursor | null,
  ) {}
}
