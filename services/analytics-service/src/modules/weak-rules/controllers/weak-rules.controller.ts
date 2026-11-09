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
import { parseWindow } from '../domain/weak-rules.js';
import { WeakRulesResponseDto } from '../dto/weak-rules-response.dto.js';
import { GetGroupWeakRulesQuery, GetStudentWeakRulesQuery } from '../queries/weak-rules.queries.js';

const WINDOW_QUERY = {
  name: 'window',
  required: false,
  enum: ['7', '30', 'course'],
  description: 'Days back from today (UTC), or the whole course. Default 30 (plan 85, Q3)',
} as const;

/** Rules the checks of learners' work named as the ground of a mistake (plan 85, step 10). */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class WeakRulesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('groups/:groupId/weak-rules')
  @ApiOperation({ summary: 'Grammar rules the group\'s work was most often flagged on' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiQuery(WINDOW_QUERY)
  @ApiOkResponse({ type: WeakRulesResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found or viewer is not in its school' })
  async group(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('window') window?: string,
  ): Promise<WeakRulesResponseDto> {
    return this.queryBus.execute(new GetGroupWeakRulesQuery(groupId, user.userId, parseWindow(window)));
  }

  @Get('students/:studentId/weak-rules')
  @ApiOperation({ summary: 'Grammar rules this learner\'s work was most often flagged on' })
  @ApiParam({ name: 'studentId', format: 'uuid' })
  @ApiQuery(WINDOW_QUERY)
  @ApiQuery({ name: 'courseId', required: false, description: 'Narrow to one course' })
  @ApiOkResponse({ type: WeakRulesResponseDto })
  @ApiNotFoundResponse({ description: 'No student the viewer shares a school with' })
  async student(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('window') window?: string,
    @Query('courseId') courseId?: string,
  ): Promise<WeakRulesResponseDto> {
    return this.queryBus.execute(
      new GetStudentWeakRulesQuery(studentId, user.userId, parseWindow(window), courseId ?? null),
    );
  }
}
