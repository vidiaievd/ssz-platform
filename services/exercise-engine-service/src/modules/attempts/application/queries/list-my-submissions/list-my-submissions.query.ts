import type { MySubmissionsCursor } from '../../../domain/repositories/attempt.repository.js';

/** The three buckets a submission can be in on this screen, or all of them. */
export type MySubmissionsStatus = 'all' | 'pending' | 'returned' | 'approved';

/** One learner's own submissions — plan 47.1, screen E of the review handoff. */
export class ListMySubmissionsQuery {
  constructor(
    public readonly userId: string,
    public readonly status: MySubmissionsStatus,
    public readonly limit: number,
    public readonly after: MySubmissionsCursor | null,
  ) {}
}
