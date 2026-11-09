import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
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
import type { AccountLookupItem } from '../../application/account-views.js';
import { LookupAccountsQuery } from '../../application/queries/lookup-accounts/lookup-accounts.query.js';
import { AccountLookupResponseDto, LookupAccountsDto } from '../dto/account.dto.js';

/**
 * Plan 90, phase 1, step 9: the panel's school and user tables show each row's plan without
 * one request per row. A POST only because 200 ids do not fit a query string; it changes nothing.
 */
@ApiTags('Admin — accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: "Caller is not platform_admin of the route's admin level (admin-panel session)" })
@UseGuards(AdminLevelGuard)
@RequireAdminLevel('support')
@Controller('admin/subscriptions/accounts')
export class AdminAccountsLookupController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('lookup')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Current plan of many payers at once',
    description:
      'Per id: the plan it runs on now (its subscription, or the audience free plan when it has none or was ' +
      'never seen), the subscription status and term, and counts of active and scheduled grants.',
  })
  @ApiOkResponse({ type: AccountLookupResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown type, no ids, more than 200 ids or an id that is not a UUID' })
  async lookup(@Body() body: LookupAccountsDto): Promise<{ items: AccountLookupItem[] }> {
    const items: AccountLookupItem[] = await this.queryBus.execute(new LookupAccountsQuery(body.type, body.ids));
    return { items };
  }
}
