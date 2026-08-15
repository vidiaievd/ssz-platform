import type { ReviewDecision } from '../../../domain/entities/attempt.entity.js';

/**
 * A teacher's verdict on a submission the machine refused to close.
 *
 * `approved` scores the attempt from the decisions; `returned` sends it back with a
 * comment and no score. There is no third outcome — a queue whose entries can be left
 * half-decided is a queue a learner waits in twice.
 */
export class ReviewAttemptCommand {
  constructor(
    public readonly attemptId: string,
    public readonly reviewerId: string,
    public readonly outcome: 'approved' | 'returned',
    public readonly decisions: ReviewDecision[],
    public readonly comment: string | null,
  ) {}
}
