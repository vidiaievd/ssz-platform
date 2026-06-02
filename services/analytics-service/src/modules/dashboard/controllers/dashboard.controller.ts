import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { GetKpisQuery } from '../queries/get-kpis.query.js';
import { GetKpisResponseDto } from '../dto/kpi-response.dto.js';
import { GetAtRiskQuery } from '../queries/get-at-risk.query.js';
import { GetAtRiskResponseDto } from '../dto/at-risk-response.dto.js';
import { GetCourseHealthQuery } from '../queries/get-course-health.query.js';
import { GetCourseHealthResponseDto } from '../dto/course-health-response.dto.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('schools/:schoolId/dashboard')
export class DashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get school dashboard KPIs (value, delta, trend, sparkline)' })
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
}
