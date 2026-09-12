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
import { GetGroupProgressQuery } from '../queries/get-group-progress.query.js';
import { GetGroupHeatmapQuery } from '../queries/get-group-heatmap.query.js';
import { GroupProgressResponseDto } from '../dto/group-progress-response.dto.js';
import { GroupHeatmapResponseDto } from '../dto/group-heatmap-response.dto.js';

/**
 * Group surfaces, keyed by the group and not by its school (plan 58 §2 E).
 *
 * The existing school routes sit under `analytics/schools/:schoolId`; these deliberately
 * do not. `GroupDirectory` already knows which school a group belongs to, and the tutor
 * contour that reads the same screens has no school to name.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/groups/:groupId')
export class GroupAnalyticsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('progress')
  @ApiOperation({ summary: 'Delivered against absorbed, per unit of the group\'s course' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ type: GroupProgressResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found or viewer is not in its school' })
  async progress(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupProgressResponseDto> {
    return this.queryBus.execute(new GetGroupProgressQuery(groupId, user.userId));
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Every learner of the group against every unit of its course' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ type: GroupHeatmapResponseDto })
  @ApiNotFoundResponse({ description: 'Group not found or viewer is not in its school' })
  async heatmap(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GroupHeatmapResponseDto> {
    return this.queryBus.execute(new GetGroupHeatmapQuery(groupId, user.userId));
  }
}
