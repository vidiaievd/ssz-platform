import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { GetLearnerPositionContextQuery } from '../../application/queries/get-learner-position-context/get-learner-position-context.query.js';
import type { LearnerPositionContextResult } from '../../application/queries/get-learner-position-context/get-learner-position-context.handler.js';
import { GetStudentStandingQuery } from '../../application/queries/get-student-standing/get-student-standing.query.js';
import type { StudentStandingResult } from '../../application/queries/get-student-standing/get-student-standing.handler.js';

/**
 * What another service needs to know about a learner's own screens.
 *
 * Service-to-service only, same guard as the other internal controllers: the answer
 * names a learner's group, which is not something to hand out on a public route.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal')
export class InternalLearnerController {
  constructor(private readonly queryBus: QueryBus) {}

  /**
   * The group a learner's position is read against, and whether their school shows it.
   *
   * Asked by the web BFF before it draws the one sentence of screen F. The policy comes
   * back with the group rather than being fetched separately, because a caller that can
   * forget to ask for it is a caller that will eventually show the sentence to a school
   * that turned it off.
   */
  @Get('students/:userId/position-context')
  async getPositionContext(
    @Param('userId') userId: string,
    @Query('courseId') courseId?: string,
  ): Promise<LearnerPositionContextResult> {
    return this.queryBus.execute<GetLearnerPositionContextQuery, LearnerPositionContextResult>(
      new GetLearnerPositionContextQuery(userId, courseId),
    );
  }

  /**
   * Whether the learner is a current student of the school — not staff, not archived.
   * ai-service asks before the school pays for the learner's assistant (plan 83, step 3).
   */
  @Get('schools/:schoolId/students/:userId/standing')
  async getStudentStanding(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId') userId: string,
  ): Promise<StudentStandingResult> {
    return this.queryBus.execute<GetStudentStandingQuery, StudentStandingResult>(
      new GetStudentStandingQuery(schoolId, userId),
    );
  }
}
