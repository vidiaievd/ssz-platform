import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import type { AdminStats } from '../../application/admin-stats.js';
import { GetAdminStatsQuery } from '../../application/queries/get-admin-stats/get-admin-stats.query.js';
import { AdminStatsQueryDto, AdminStatsResponseDto } from '../dto/admin-stats.dto.js';

/** Plan 90, phase 3, step 2: the dashboard's tariff numbers and its "ends soon" attention rows. */
@ApiTags('Admin — accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: "Caller is not platform_admin of the route's admin level (admin-panel session)" })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/subscriptions/stats')
export class AdminSubscriptionStatsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Payers per plan and what ends soon',
    description:
      'Every plan with its current subscribers per version; accounts per payer type with and without a ' +
      'subscription; live grants and current subscriptions ending within `withinDays` (default 7), soonest first, ' +
      'at most 100 each.',
  })
  @ApiOkResponse({ type: AdminStatsResponseDto })
  @ApiBadRequestResponse({ description: 'withinDays outside 1–90' })
  stats(@Query() query: AdminStatsQueryDto): Promise<AdminStats> {
    return this.queryBus.execute(new GetAdminStatsQuery(query.withinDays ?? 7));
  }
}
