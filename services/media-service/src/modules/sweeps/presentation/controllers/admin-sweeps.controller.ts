import { Controller, Get, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
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
import { GetSweepsOverviewQuery } from '../../application/queries/get-sweeps-overview/get-sweeps-overview.query.js';
import { SweepsOverviewDto } from '../dto/sweeps-overview.dto.js';

/** Media sweeps for the platform admin panel (plan 90, phase 8, steps 3–4). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@Controller('admin/media/sweeps')
export class AdminSweepsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'The four media sweeps: schedule, nightly mode, age limit and the last 10 runs of each',
    description:
      'Runs of every origin — nightly, admin panel, operator — with the report as the sweep returned it and a ' +
      'common `summary` (found / kept / deleted). The nightly mode is env `MEDIA_ORPHAN_SWEEP_MODE` and is not ' +
      'changed here. Admin-panel token, level `support` or higher.',
  })
  @ApiOkResponse({ type: SweepsOverviewDto })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
  async overview(): Promise<SweepsOverviewDto> {
    return this.queryBus.execute(new GetSweepsOverviewQuery());
  }
}
