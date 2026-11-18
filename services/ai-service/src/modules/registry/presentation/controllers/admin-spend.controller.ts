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
import { RequireAdminLevel } from '../../../../common/decorators/require-admin-level.decorator.js';
import { AdminLevelGuard } from '../../../../common/guards/admin-level.guard.js';
import { GetPlatformSpendQuery } from '../../application/queries/get-platform-spend/get-platform-spend.query.js';
import { resolveSpendPeriod, type PlatformSpend } from '../../domain/platform-spend.js';
import { PlatformSpendResponseDto, SpendQueryDto } from '../dto/spend.dto.js';

/** What the platform spends on AI, per model — the admin panel's «AI → Spend» (plan 90, phase 7, step 2). */
@ApiTags('Admin — spend')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin of the route\'s admin level (admin-panel session)' })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/ai/spend')
export class AdminSpendController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'The platform’s AI spend per model for a period',
    description:
      'From the call ledger (`ai_calls`): every call that reached a model, whoever paid for it — schools, learners ' +
      'and the platform’s own admin calls. Money is what the provider bills at the price in effect when the call ' +
      'was made; tokens for language models, audio for speech models (Azure Speech, whisper), characters for ' +
      'synthesizers. `from` / `to` are UTC days, both inclusive (default: 30 days ending today, at most 366).',
  })
  @ApiOkResponse({ type: PlatformSpendResponseDto })
  @ApiBadRequestResponse({ description: 'A malformed day, `from` after `to`, or a period over 366 days' })
  async get(@Query() query: SpendQueryDto): Promise<PlatformSpend> {
    const resolved = resolveSpendPeriod(query.from, query.to, new Date());
    if (!resolved.ok) throw new BadRequestException(resolved.error);
    return this.queryBus.execute(new GetPlatformSpendQuery(resolved.period));
  }
}
