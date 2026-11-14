import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminLevel } from '@ssz/contracts';
import { RequireAdminLevel } from '../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../common/guards/admin-level.guard.js';
import { AdminUsageDto } from '../dto/admin-usage.dto.js';
import { GetAdminAiUsageQuery } from '../queries/get-admin-ai-usage.query.js';
import { parseAdminUsageParams } from './admin-usage.params.js';

/**
 * AI spend per payer for the platform admin panel (plan 90, phase 7, step 12), over the
 * `ai_usage_daily` rollup. The path sits under `admin/ai`, which the gateway sends to ai-service;
 * this exact path comes here (`location = /api/v1/admin/ai/usage`), while ai-service's
 * `admin/ai/usage/:payerType/:payerId` (one payer's keys against its tariff) stays where it is.
 */
@ApiTags('Admin AI usage')
@ApiBearerAuth()
@UseGuards(AdminLevelGuard)
@RequireAdminLevel(AdminLevel.SUPPORT)
@Controller('admin/ai/usage')
export class AdminUsageController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'AI spend by capability, by payer (top N) or by ISO week',
    description:
      'Calls, credits, unpriced calls and tokens from the daily rollup of `ai.call.completed`. School names ' +
      'come from organization `admin/schools`. Admin-panel token, level `support` or higher.',
  })
  @ApiQuery({ name: 'from', required: false, description: 'First UTC day, inclusive; with `to`, or both omitted = last 30 days' })
  @ApiQuery({ name: 'to', required: false, description: 'Last UTC day, inclusive; the range is at most 366 days' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['capability', 'payer', 'week'], description: 'Default `capability`' })
  @ApiQuery({ name: 'payerType', required: false, enum: ['workspace', 'user', 'platform'] })
  @ApiQuery({ name: 'limit', required: false, description: '`groupBy=payer`: top N, 1–100, default 20' })
  @ApiOkResponse({ type: AdminUsageDto })
  @ApiBadRequestResponse({ description: 'Bad day, range, `groupBy`, `payerType` or `limit`' })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  @ApiForbiddenResponse({ description: 'Not platform_admin, or a token without an admin level (`ADMIN_LEVEL_REQUIRED`)' })
  async usage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
    @Query('payerType') payerType?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminUsageDto> {
    const params = parseAdminUsageParams({ from, to, groupBy, payerType, limit });
    return this.queryBus.execute(
      new GetAdminAiUsageQuery(params.from, params.to, params.groupBy, params.payerType, params.limit),
    );
  }
}
