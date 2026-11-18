import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAdmin } from '../../../common/decorators/current-admin.decorator.js';
import { RequireAdminLevel } from '../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../common/guards/admin-level.guard.js';
import type { AdminActor } from '../../../shared/application/admin-audit.js';
import { PutPayerPolicyCommand } from '../application/commands/put-payer-policy/put-payer-policy.command.js';
import type { EffectivePayerPolicy } from '../application/queries/get-payer-policy/get-payer-policy.handler.js';
import { GetPayerPolicyQuery } from '../application/queries/get-payer-policy/get-payer-policy.query.js';
import { PAYER_ID_PARAM, PAYER_TYPE_PARAM, payerType } from './payer-param.js';
import { PayerPolicyResponseDto, PutPayerPolicyDto } from './payer-policy.dto.js';

/**
 * A payer's own AI rules, until a school's settings screen writes them. The gate reads them
 * on every call.
 */
@ApiTags('Admin — access')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin of the route\'s admin level (admin-panel session)' })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/ai/payer-policies')
export class AdminPayerPoliciesController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get(':payerType/:payerId')
  @ApiOperation({ summary: "The policy the gate applies to a payer — stored, or the default (on, any region)" })
  @ApiParam(PAYER_TYPE_PARAM)
  @ApiParam(PAYER_ID_PARAM)
  @ApiOkResponse({ type: PayerPolicyResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown payer type or malformed id' })
  get(
    @Param('payerType') type: string,
    @Param('payerId', ParseUUIDPipe) id: string,
  ): Promise<EffectivePayerPolicy> {
    return this.queryBus.execute(new GetPayerPolicyQuery(payerType(type), id));
  }

  @RequireAdminLevel('admin')
  @Put(':payerType/:payerId')
  @ApiOperation({
    summary: "Set a payer's policy",
    description:
      'aiEnabled: false refuses every agent for the payer. allowedRegions limits which providers its data may reach: ' +
      'the router steps over models outside them, and a binding with no allowed model is refused (refused_policy). ' +
      '`reason` is required; the change goes to the admin trail as `payer_policy.changed` (before/after).',
  })
  @ApiParam(PAYER_TYPE_PARAM)
  @ApiParam(PAYER_ID_PARAM)
  @ApiOkResponse({ type: PayerPolicyResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown payer type, malformed id, or an invalid body (empty region list, missing or blank reason included)' })
  async put(
    @Param('payerType') type: string,
    @Param('payerId', ParseUUIDPipe) id: string,
    @Body() body: PutPayerPolicyDto,
    @CurrentAdmin() admin: AdminActor,
  ): Promise<EffectivePayerPolicy> {
    const saved = await this.commandBus.execute(
      new PutPayerPolicyCommand(
        payerType(type),
        id,
        { aiEnabled: body.aiEnabled, allowedRegions: body.allowedRegions },
        admin,
        body.reason,
      ),
    );
    return { ...saved, stored: true };
  }
}
