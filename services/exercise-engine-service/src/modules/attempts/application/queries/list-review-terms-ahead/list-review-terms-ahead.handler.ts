import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListReviewTermsAheadQuery } from './list-review-terms-ahead.query.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
  type ReviewTermRow,
} from '../../../domain/repositories/attempt.repository.js';

/** A ceiling, not a page: past it a warning still says "this much and more". */
export const MAX_TERM_ROWS = 1000;

export interface ListReviewTermsAheadResult {
  terms: ReviewTermRow[];
}

/**
 * The warning's one question: which submissions in this school will count as the model
 * marked them, and when.
 *
 * Only work the term job would actually close — in the queue, a provisional verdict on
 * it, the term ahead. Work under the policy that the model never answered has a term
 * stamped on it too, but nothing happens to it then, and warning a teacher about it would
 * be a promise the platform does not keep. A term already passed belongs to the job, not
 * to a warning; it is gone within minutes.
 *
 * Who reviews each group is not the engine's to say (plan 44 §0.2): the rows carry the
 * group, and the caller asks organization-service.
 */
@QueryHandler(ListReviewTermsAheadQuery)
export class ListReviewTermsAheadHandler implements IQueryHandler<ListReviewTermsAheadQuery> {
  constructor(@Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository) {}

  async execute(query: ListReviewTermsAheadQuery): Promise<ListReviewTermsAheadResult> {
    const now = new Date();
    const until = new Date(now.getTime() + query.withinHours * 60 * 60 * 1000);

    const terms = await this.attempts.findReviewTermsAhead(
      query.schoolId,
      now,
      until,
      MAX_TERM_ROWS,
    );
    return { terms };
  }
}
