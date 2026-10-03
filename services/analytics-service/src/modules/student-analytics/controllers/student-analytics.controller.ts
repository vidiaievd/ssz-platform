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
  GetNextPracticeQuery,
  GetStudentGridQuery,
  GetStudentPositionQuery,
  GetStudentWorkContextQuery,
} from '../queries/student-analytics.queries.js';
import {
  ModalityGapResponseDto,
  NextPracticeResponseDto,
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

  /**
   * What to work on next, and on what grounds — plan 63 §3 phase 8.
   *
   * The first route here that proposes rather than reports. It answers in atoms and
   * modalities, not exercises: the exercise is the disposable probe, and a plan made of
   * exercises is a plan that goes stale the moment one is edited.
   */
  @Get('next-practice')
  @ApiOperation({ summary: 'What this learner should practise next, with the evidence for each' })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiQuery({
    name: 'budget',
    required: false,
    example: '15m',
    description: 'How long there is for this — `15m`, `15`, or `1h`. Default 15 minutes',
  })
  @ApiQuery({
    name: 'courseId',
    required: false,
    description: 'Narrow to one course, and let the list look ahead to its next unit',
  })
  @ApiOkResponse({ type: NextPracticeResponseDto })
  @ApiNotFoundResponse({ description: 'No student the viewer shares a school with' })
  async nextPractice(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('budget') budget?: string,
    @Query('courseId') courseId?: string,
  ): Promise<NextPracticeResponseDto> {
    return this.queryBus.execute(
      new GetNextPracticeQuery(studentId, user.userId, courseId ?? null, parseBudget(budget)),
    );
  }
}

/**
 * `15m`, `15`, `1h` — minutes either way.
 *
 * Unparseable input falls back to the default rather than 400ing: a budget is a hint about
 * how long the list should be, and refusing to suggest anything because someone wrote
 * `quarter of an hour` helps nobody. The handler clamps the number it gets.
 */
function parseBudget(raw: string | undefined): number {
  const DEFAULT_MINUTES = 15;
  if (!raw) return DEFAULT_MINUTES;

  const match = /^\s*(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)?\s*$/i.exec(raw);
  if (!match) return DEFAULT_MINUTES;

  const amount = Number.parseInt(match[1] as string, 10);
  if (!Number.isFinite(amount) || amount <= 0) return DEFAULT_MINUTES;

  const unit = (match[2] ?? 'm').toLowerCase();
  return unit.startsWith('h') ? amount * 60 : amount;
}
