import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListPendingReviewSchoolsQuery } from './list-pending-review-schools.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';

export interface PendingReviewSchool {
  schoolId: string;
  pending: number;
  oldestSubmittedAt: Date;
  /**
   * The newest submission waiting, which is how a digest job knows whether anything has
   * happened since it last wrote to anyone (plan 47.5, dedup). A count would not do: work
   * marked and work handed in can cancel out and leave the same number.
   */
  newestSubmittedAt: Date;
}

export interface ListPendingReviewSchoolsResult {
  schools: PendingReviewSchool[];
}

/**
 * The digest's first question, and the one that keeps it cheap.
 *
 * It reports what is waiting and since when, and nothing about whether that is *late* —
 * lateness is measured against a promise the school made, which lives in
 * organization-service (plan 44 §0.1). The engine holding an opinion about it would be a
 * second formula for urgency, drifting away from the first.
 */
@QueryHandler(ListPendingReviewSchoolsQuery)
export class ListPendingReviewSchoolsHandler
  implements IQueryHandler<ListPendingReviewSchoolsQuery>
{
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(): Promise<ListPendingReviewSchoolsResult> {
    const rows = await this.attempts.findSchoolsWithPendingReview();

    return {
      // Most waiting first: a job that has to stop early should have spent its time on
      // the schools where the most people are waiting.
      schools: [...rows].sort((a, b) => b.pending - a.pending),
    };
  }
}
