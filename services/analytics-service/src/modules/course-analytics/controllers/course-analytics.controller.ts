import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { GetCourseResultQuery } from '../queries/get-course-result.query.js';
import { CourseResultResponseDto } from '../dto/course-result-response.dto.js';

/** Screen E — a course's own results, next to the coverage report of what it trains. */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/containers/:containerId')
export class CourseAnalyticsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('result')
  @ApiOperation({ summary: 'What came out of this course, by skill and focus' })
  @ApiParam({ name: 'containerId', format: 'uuid' })
  @ApiOkResponse({ type: CourseResultResponseDto })
  @ApiNotFoundResponse({ description: 'No such course, or the viewer does not own it' })
  async result(
    @Param('containerId', ParseUUIDPipe) containerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CourseResultResponseDto> {
    return this.queryBus.execute(new GetCourseResultQuery(containerId, user.userId));
  }
}
