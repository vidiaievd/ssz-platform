import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
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
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { PlatformAdminGuard } from '../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { PutPayerPolicyCommand } from '../application/commands/put-payer-policy/put-payer-policy.command.js';
import type { EffectivePayerPolicy } from '../application/queries/get-payer-policy/get-payer-policy.handler.js';
import { GetPayerPolicyQuery } from '../application/queries/get-payer-policy/get-payer-policy.query.js';
import { BILLED_PAYER_TYPES, type BilledPayerType } from '../domain/payer.js';
import { PayerPolicyResponseDto, PutPayerPolicyDto } from './payer-policy.dto.js';

const PAYER_TYPE_PARAM = { name: 'payerType', enum: BILLED_PAYER_TYPES, description: 'workspace (school, incl. SOLO) or user' };
const PAYER_ID_PARAM = { name: 'payerId', format: 'uuid', description: 'schoolId or userId' };

function payerType(value: string): BilledPayerType {
  if (!(BILLED_PAYER_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`payerType must be one of: ${BILLED_PAYER_TYPES.join(', ')}`);
  }
  return value as BilledPayerType;
}

/**
 * A payer's own AI rules, until a school's settings screen writes them. The gate reads them
 * on every call.
 */
@ApiTags('Admin — access')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
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

  @Put(':payerType/:payerId')
  @ApiOperation({
    summary: "Set a payer's policy",
    description:
      'aiEnabled: false refuses every agent for the payer. allowedRegions limits which providers its data may reach: ' +
      'the router steps over models outside them, and a binding with no allowed model is refused (refused_policy).',
  })
  @ApiParam(PAYER_TYPE_PARAM)
  @ApiParam(PAYER_ID_PARAM)
  @ApiOkResponse({ type: PayerPolicyResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown payer type, malformed id, or an invalid body (empty region list included)' })
  async put(
    @Param('payerType') type: string,
    @Param('payerId', ParseUUIDPipe) id: string,
    @Body() body: PutPayerPolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EffectivePayerPolicy> {
    const saved = await this.commandBus.execute(
      new PutPayerPolicyCommand(payerType(type), id, { aiEnabled: body.aiEnabled, allowedRegions: body.allowedRegions }, user.userId),
    );
    return { ...saved, stored: true };
  }
}
