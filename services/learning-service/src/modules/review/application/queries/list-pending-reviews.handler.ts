import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SUBMISSION_REPOSITORY, type ISubmissionRepository } from '../../domain/repositories/submission.repository.interface.js';
import { toSubmissionDto, type SubmissionDto } from '../dto/submission.dto.js';
import { ListPendingReviewsQuery } from './list-pending-reviews.query.js';

@QueryHandler(ListPendingReviewsQuery)
export class ListPendingReviewsHandler implements IQueryHandler<ListPendingReviewsQuery, SubmissionDto[]> {
  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly repo: ISubmissionRepository,
  ) {}

  async execute(query: ListPendingReviewsQuery): Promise<SubmissionDto[]> {
    const submissions = await this.repo.findPendingBySchool(query.schoolId, {
      limit: query.limit,
      offset: query.offset,
    });
    return submissions.map(toSubmissionDto);
  }
}
