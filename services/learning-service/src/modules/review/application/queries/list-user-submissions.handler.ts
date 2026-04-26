import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SUBMISSION_REPOSITORY, type ISubmissionRepository } from '../../domain/repositories/submission.repository.interface.js';
import { toSubmissionDto, type SubmissionDto } from '../dto/submission.dto.js';
import { ListUserSubmissionsQuery } from './list-user-submissions.query.js';
import type { SubmissionStatus } from '../../domain/entities/submission.entity.js';

@QueryHandler(ListUserSubmissionsQuery)
export class ListUserSubmissionsHandler implements IQueryHandler<ListUserSubmissionsQuery, SubmissionDto[]> {
  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly repo: ISubmissionRepository,
  ) {}

  async execute(query: ListUserSubmissionsQuery): Promise<SubmissionDto[]> {
    const status = query.status ? [query.status as SubmissionStatus] : undefined;
    const submissions = await this.repo.findByUser(query.userId, {
      status,
      limit: query.limit,
      offset: query.offset,
    });
    return submissions.map(toSubmissionDto);
  }
}
