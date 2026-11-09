import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { AdminLevel } from '@ssz/contracts';
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import { resolvePeriod, type AdminStats } from '../../domain/admin-stats.js';
import { GetAdminStatsQuery } from '../../application/queries/get-admin-stats.query.js';
import { AdminStatsDto, AdminStatsQueryDto } from '../dto/admin-stats.dto.js';

/** Platform-wide school and people numbers for the admin dashboard (plan 90 §5, phase 1, step 8). */
@ApiTags('Admin — schools')
@ApiBearerAuth('JWT')
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Schools by status and kind, students and teachers, growth by day',
    description:
      'UTC days, both ends inclusive, at most 366; default the last 30 days. People are counted once across ' +
      'schools; schools deleted softly count in the school numbers only. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: AdminStatsDto })
  @ApiBadRequestResponse({ description: 'A date that is not YYYY-MM-DD, `from` after `to`, or more than 366 days' })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
  get(@Query() query: AdminStatsQueryDto): Promise<AdminStats> {
    const result = resolvePeriod(query.from, query.to, new Date());
    if (!result.ok) throw new BadRequestException(result.error);
    return this.queryBus.execute(new GetAdminStatsQuery(result.period));
  }
}
