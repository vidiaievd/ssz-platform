import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import {
  GetModalityGapQuery,
  GetStudentGridQuery,
  GetStudentPositionQuery,
  GetStudentWorkContextQuery,
} from '../queries/student-analytics.queries.js';
import {
  ModalityGapResponseDto,
  StudentGridResponseDto,
  StudentPositionResponseDto,
  StudentWorkContextResponseDto,
} from '../dto/student-analytics-response.dto.js';

/**
 * One learner's own numbers — screen C for their teacher, and the band on screen F for
 * the learner themselves (plan 58, phase 4).
 *
 * Keyed by the learner and not by their school, as the group routes are (§2 E): the tutor
 * contour that reads the same screens has no school to name.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/students/:studentId')
export class StudentAnalyticsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('grid')
  @ApiOperation({ summary: 'The learner’s skill × focus grid, every cell named' })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiQuery({ name: 'courseId', required: false, description: 'Narrow to one course' })
  @ApiOkResponse({ type: StudentGridResponseDto })
  @ApiNotFoundResponse({ description: 'No student the viewer shares a school with' })
  async grid(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('courseId') courseId?: string,
  ): Promise<StudentGridResponseDto> {
    return this.queryBus.execute(new GetStudentGridQuery(studentId, user.userId, courseId ?? null));
  }

  @Get('position')
  @ApiOperation({ summary: 'Where this learner stands against their group' })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiQuery({ name: 'groupId', required: true, format: 'uuid' })
  @ApiOkResponse({
    type: StudentPositionResponseDto,
    description: 'null when nothing in the group has been measured — never a zero',
  })
  @ApiNotFoundResponse({ description: 'No such student, or they are not in that group' })
  async position(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentPositionResponseDto | null> {
    return this.queryBus.execute(new GetStudentPositionQuery(studentId, user.userId, groupId));
  }

  @Get('work-context')
  @ApiOperation({ summary: 'Where this learner’s work happens — the four buckets' })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiQuery({ name: 'courseId', required: false })
  @ApiOkResponse({ type: StudentWorkContextResponseDto })
  async workContext(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('courseId') courseId?: string,
  ): Promise<StudentWorkContextResponseDto> {
    return this.queryBus.execute(
      new GetStudentWorkContextQuery(studentId, user.userId, courseId ?? null),
    );
  }

  /**
   * What this learner knows only one way — plan 63 §4.1.
   *
   * The answer to "what should we work on", as opposed to "how many percent": 90 % picking
   * a word off a list against 30 % typing it is not uneven knowledge, it is knowledge that
   * has reached recognition and stopped, and more of the same exercises will not move it.
   */
  @Get('modality-gap')
  @ApiOperation({ summary: 'Facts this learner recognises and cannot produce' })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiQuery({ name: 'courseId', required: false, description: 'Narrow to one course' })
  @ApiQuery({ name: 'limit', required: false, description: 'How many findings to return (default 25)' })
  @ApiOkResponse({ type: ModalityGapResponseDto })
  @ApiNotFoundResponse({ description: 'No student the viewer shares a school with' })
  async modalityGap(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('courseId') courseId?: string,
    @Query('limit') limit?: string,
  ): Promise<ModalityGapResponseDto> {
    // Clamped rather than rejected: a page size is never worth a 400, and a screen asking
    // for a thousand findings is asking for a list nobody reads.
    const parsed = Number.parseInt(limit ?? '', 10);
    const size = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 25;

    return this.queryBus.execute(
      new GetModalityGapQuery(studentId, user.userId, courseId ?? null, size),
    );
  }
}
