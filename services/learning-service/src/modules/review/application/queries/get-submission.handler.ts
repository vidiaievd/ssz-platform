import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { SUBMISSION_REPOSITORY, type ISubmissionRepository } from '../../domain/repositories/submission.repository.interface.js';
import {
  SubmissionNotFoundError,
  SubmissionForbiddenError,
  type ReviewApplicationError,
} from '../errors/review-application.errors.js';
import { toSubmissionDto, type SubmissionDto } from '../dto/submission.dto.js';
import { GetSubmissionQuery } from './get-submission.query.js';

@QueryHandler(GetSubmissionQuery)
export class GetSubmissionHandler
  implements IQueryHandler<GetSubmissionQuery, Result<SubmissionDto, ReviewApplicationError>>
{
  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly repo: ISubmissionRepository,
  ) {}

  async execute(query: GetSubmissionQuery): Promise<Result<SubmissionDto, ReviewApplicationError>> {
    const submission = await this.repo.findById(query.submissionId);
    if (!submission) {
      return Result.fail(new SubmissionNotFoundError(query.submissionId));
    }

    const isPlatformAdmin = query.requestingUserRoles.includes('platform_admin');
    const isOwner = submission.userId === query.requestingUserId;
    if (!isOwner && !isPlatformAdmin) {
      return Result.fail(new SubmissionForbiddenError('only the submitter or platform admin can view this submission'));
    }

    return Result.ok(toSubmissionDto(submission));
  }
}
