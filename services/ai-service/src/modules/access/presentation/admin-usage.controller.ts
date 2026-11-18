import { Controller, Get, Param, ParseUUIDPipe, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequireAdminLevel } from '../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../common/guards/admin-level.guard.js';
import type { PayerUsage } from '../application/queries/get-payer-usage/get-payer-usage.handler.js';
import { GetPayerUsageQuery } from '../application/queries/get-payer-usage/get-payer-usage.query.js';
import { PayerUsageResponseDto } from './admin-usage.dto.js';
import { PAYER_ID_PARAM, PAYER_TYPE_PARAM, payerType } from './payer-param.js';

/** A payer's AI keys and their spend this period — the admin panel's «AI and services» tab (plan 90, phase 3). */
@ApiTags('Admin — access')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin of the route\'s admin level (admin-panel session)' })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/ai/usage')
export class AdminUsageController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':payerType/:payerId')
  @ApiOperation({
    summary: "A payer's AI keys with this period's spend, and its policy",
    description:
      'Every AI key in catalog order: `enabled` as the gate reads the tariff (plan, grants, a disabling grant last); ' +
      'for a key that is on, `used` / `total` / `periodEnd` counted as the learner’s own `ai/usage/me` counts them. ' +
      'A key that is off has no spend. A payer subscription-service does not know is on its audience’s free plan. ' +
      '`policy.aiEnabled: false` refuses every key regardless of `enabled`.',
  })
  @ApiParam(PAYER_TYPE_PARAM)
  @ApiParam(PAYER_ID_PARAM)
  @ApiOkResponse({ type: PayerUsageResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown payer type or malformed id' })
  @ApiServiceUnavailableResponse({ description: 'The tariff or the ledger could not be read' })
  async get(@Param('payerType') type: string, @Param('payerId', ParseUUIDPipe) id: string): Promise<PayerUsageResponseDto> {
    const result: PayerUsage = await this.queryBus.execute(new GetPayerUsageQuery(payerType(type), id));
    if (result.kind === 'unavailable') throw new ServiceUnavailableException('Usage is unavailable');
    return {
      payerType: result.policy.payerType,
      payerId: result.policy.payerId,
      policy: result.policy,
      features: result.features.map((f) => ({
        feature: f.featureKey,
        enabled: f.enabled,
        used: f.used,
        total: f.total,
        periodEnd: f.periodEnd?.toISOString() ?? null,
        limits: f.limits,
      })),
    };
  }
}
