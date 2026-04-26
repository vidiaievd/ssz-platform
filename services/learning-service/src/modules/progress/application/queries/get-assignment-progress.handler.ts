import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../../../assignments/domain/repositories/assignment.repository.interface.js';
import { toProgressDto, type AssignmentProgressDto } from '../dto/progress.dto.js';
import {
  AssignmentNotFoundForProgressError,
  ProgressForbiddenError,
} from '../errors/progress-application.errors.js';
import { GetAssignmentProgressQuery } from './get-assignment-progress.query.js';
import { Result } from '../../../../shared/kernel/result.js';

@QueryHandler(GetAssignmentProgressQuery)
export class GetAssignmentProgressHandler
  implements IQueryHandler<GetAssignmentProgressQuery, Result<AssignmentProgressDto, AssignmentNotFoundForProgressError | ProgressForbiddenError>>
{
  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignmentRepo: IAssignmentRepository,
    @Inject(PROGRESS_REPOSITORY) private readonly progressRepo: IProgressRepository,
  ) {}

  async execute(
    query: GetAssignmentProgressQuery,
  ): Promise<Result<AssignmentProgressDto, AssignmentNotFoundForProgressError | ProgressForbiddenError>> {
    const assignment = await this.assignmentRepo.findById(query.assignmentId);
    if (!assignment) {
      return Result.fail(new AssignmentNotFoundForProgressError(query.assignmentId));
    }

    const isAssignee = assignment.assigneeId === query.requestingUserId;
    const isAssigner = assignment.assignerId === query.requestingUserId;
    if (!isAssignee && !isAssigner) {
      return Result.fail(new ProgressForbiddenError('only the assigner or assignee can view assignment progress'));
    }

    const progress = await this.progressRepo.findByUserAndContent(
      assignment.assigneeId,
      assignment.contentRef.type,
      assignment.contentRef.id,
    );

    return Result.ok({
      assignmentId: assignment.id,
      assigneeId: assignment.assigneeId,
      contentRef: { type: assignment.contentRef.type, id: assignment.contentRef.id },
      progress: progress ? toProgressDto(progress) : null,
    });
  }
}
