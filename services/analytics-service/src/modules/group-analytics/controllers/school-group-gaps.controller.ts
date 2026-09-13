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
import { GetGroupGapsQuery } from '../queries/get-group-gaps.query.js';
import { GroupGapsResponseDto } from '../dto/group-gaps-response.dto.js';

/**
 * The one group surface addressed by school rather than by group.
 *
 * It lives in this module, not beside the other `analytics/schools/:schoolId` routes,
 * because it is the group chart's own numbers gathered up: one service reads them, and a
 * copy over in school-analytics would be the second definition of "taught" this package
 * exists to prevent.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/schools/:schoolId')
export class SchoolGroupGapsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('group-gaps')
  @ApiOperation({ summary: 'Delivered against absorbed for every group of a school' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: GroupGapsResponseDto })
  @ApiNotFoundResponse({ description: 'School not found or viewer is not a member' })
  async groupGaps(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupGapsResponseDto> {
    return this.queryBus.execute(new GetGroupGapsQuery(schoolId, user.userId));
  }
}
