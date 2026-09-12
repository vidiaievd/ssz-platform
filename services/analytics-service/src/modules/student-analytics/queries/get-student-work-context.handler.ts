import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { StudentAccessService } from '../student-access.service.js';
import { WorkContextService } from '../../group-analytics/work-context.service.js';
import { GetStudentWorkContextQuery } from './student-analytics.queries.js';
import type { StudentWorkContextResponseDto } from '../dto/student-analytics-response.dto.js';

/**
 * Where this learner's work happens — the same four buckets the group's bar shows.
 *
 * One service counts both (see `WorkContextService`): a teacher who clicks from the
 * group's bar into a learner's must not find the two disagreeing about what homework is.
 */
@QueryHandler(GetStudentWorkContextQuery)
@Injectable()
export class GetStudentWorkContextHandler
  implements IQueryHandler<GetStudentWorkContextQuery, StudentWorkContextResponseDto>
{
  constructor(
    private readonly access: StudentAccessService,
    private readonly workContext: WorkContextService,
  ) {}

  async execute(query: GetStudentWorkContextQuery): Promise<StudentWorkContextResponseDto> {
    const { studentId, viewerUserId, courseId } = query;
    await this.access.assertMayRead(studentId, viewerUserId);

    const reading = await this.workContext.of([studentId], courseId);

    return {
      studentId,
      courseId,
      buckets: reading.buckets,
      unattributed: reading.unattributed,
    };
  }
}
