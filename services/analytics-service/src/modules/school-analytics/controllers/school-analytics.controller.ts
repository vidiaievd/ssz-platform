import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NudgeAtRiskCommand } from '../commands/nudge-at-risk.command.js';
import { NudgeRequestDto, NudgeResponseDto } from '../dto/nudge-request.dto.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { GetKpisQuery } from '../queries/get-kpis.query.js';
import { GetKpisResponseDto } from '../dto/kpi-response.dto.js';
import { GetAtRiskQuery } from '../queries/get-at-risk.query.js';
import { GetAtRiskResponseDto } from '../dto/at-risk-response.dto.js';
import { GetCourseHealthQuery } from '../queries/get-course-health.query.js';
import { GetCourseHealthResponseDto } from '../dto/course-health-response.dto.js';
import { GetSchoolStudentsQuery } from '../queries/get-school-students.query.js';
import type { StudentSegment } from '../queries/get-school-students.query.js';
import { SchoolStudentsResponseDto } from '../dto/school-students-response.dto.js';
import { GetStudentDetailQuery } from '../queries/get-student-detail.query.js';
import { StudentDetailResponseDto } from '../dto/student-detail-response.dto.js';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/schools/:schoolId')
export class SchoolAnalyticsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get school KPIs (value, delta, trend, sparkline)' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: GetKpisResponseDto })
  @ApiForbiddenResponse({ description: 'Not a member or insufficient role' })
  @ApiNotFoundResponse({ description: 'School not found' })
  async getKpis(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GetKpisResponseDto> {
    return this.queryBus.execute(new GetKpisQuery(schoolId, user.userId));
  }

  @Get('courses/health')
  @ApiOperation({ summary: 'Get course health (enrollment + completion + trend) — sorted by enrollment' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: GetCourseHealthResponseDto })
  @ApiForbiddenResponse({ description: 'Not a member or insufficient role' })
  async getCourseHealth(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GetCourseHealthResponseDto> {
    return this.queryBus.execute(new GetCourseHealthQuery(schoolId, user.userId));
  }

  @Get('at-risk')
  @ApiOperation({ summary: 'Get at-risk students (owner/admin only) — sorted by longest inactivity' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiOkResponse({ type: GetAtRiskResponseDto })
  @ApiForbiddenResponse({ description: 'Owner or admin role required' })
  @ApiNotFoundResponse({ description: 'School not found' })
  async getAtRisk(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GetAtRiskResponseDto> {
    return this.queryBus.execute(new GetAtRiskQuery(schoolId, user.userId, Math.min(limit, 50)));
  }

  @Get('students')
  @ApiOperation({ summary: 'List school students with derived status (any school member)' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiQuery({ name: 'segment', required: false, enum: ['all', 'active', 'at-risk', 'new', 'finished', 'unassigned'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ type: SchoolStudentsResponseDto })
  @ApiNotFoundResponse({ description: 'School not found or access denied' })
  async getStudents(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('segment') segment?: StudentSegment,
    @Query('search') search?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<SchoolStudentsResponseDto> {
    return this.queryBus.execute(
      new GetSchoolStudentsQuery(schoolId, user.userId, segment ?? 'all', search, limit ?? 20, cursor),
    );
  }

  @Get('students/:userId')
  @ApiOperation({ summary: 'Get student detail — groups, status, progress, lastSeen (any school member)' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ type: StudentDetailResponseDto })
  @ApiNotFoundResponse({ description: 'School or student not found' })
  async getStudentDetail(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentDetailResponseDto> {
    return this.queryBus.execute(new GetStudentDetailQuery(schoolId, user.userId, userId));
  }

  @Post('nudge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nudge all at-risk students (owner/admin only) — publishes study-reminder event per student' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: NudgeResponseDto })
  @ApiForbiddenResponse({ description: 'Owner or admin role required' })
  async nudgeAtRisk(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() _dto: NudgeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NudgeResponseDto> {
    return this.commandBus.execute(new NudgeAtRiskCommand(schoolId, user.userId));
  }
}
