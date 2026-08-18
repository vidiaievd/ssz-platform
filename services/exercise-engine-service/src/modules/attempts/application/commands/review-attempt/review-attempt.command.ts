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
    /**
     * A note against one sentence, keyed by item. Folded into `decisions` by the handler
     * (plan 44 §44.9): the teacher's screen writes them separately, but they are the same
     * thing the domain already stores per item, and a second column for them would be a
     * second answer to "what was said about sentence two".
     */
    public readonly sentenceComments: Record<string, string> = {},
  ) {}
}
