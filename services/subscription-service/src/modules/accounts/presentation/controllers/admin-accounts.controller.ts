import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import { BusinessErrorDto } from '../../../../common/errors/business-error.dto.js';
import { PlatformAdminGuard } from '../../../../common/guards/platform-admin.guard.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { AccountHistory, AccountOverview } from '../../application/account-views.js';
import { AssignPlanCommand } from '../../application/commands/assign-plan/assign-plan.command.js';
import { CancelSubscriptionCommand } from '../../application/commands/cancel-subscription/cancel-subscription.command.js';
import { IssueGrantCommand } from '../../application/commands/issue-grant/issue-grant.command.js';
import { RevokeGrantCommand } from '../../application/commands/revoke-grant/revoke-grant.command.js';
import { GetAccountHistoryQuery } from '../../application/queries/get-account-history/get-account-history.query.js';
import { GetAccountQuery } from '../../application/queries/get-account/get-account.query.js';
import {
  AccountHistoryResponseDto,
  AccountOverviewResponseDto,
  AccountParams,
  AssignPlanDto,
  GrantParams,
  IssueGrantDto,
} from '../dto/account.dto.js';

/**
 * Accounts are addressed by what they pay for — `workspace/<schoolId>` or `user/<userId>` —
 * so an admin never needs the internal account id.
 */
@ApiTags('Admin — accounts')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Caller is not platform_admin' })
@UseGuards(PlatformAdminGuard)
@Controller('admin/subscriptions/accounts/:type/:externalId')
export class AdminAccountsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current subscription and live grants' })
  @ApiOkResponse({ type: AccountOverviewResponseDto })
  @ApiNotFoundResponse({ description: 'The payer has no billing account yet' })
  get(@Param() p: AccountParams): Promise<AccountOverview> {
    return this.queryBus.execute(new GetAccountQuery(p.type, p.externalId));
  }

  @Get('history')
  @ApiOperation({ summary: 'Every subscription and grant, newest first' })
  @ApiOkResponse({ type: AccountHistoryResponseDto })
  @ApiNotFoundResponse({ description: 'The payer has no billing account yet' })
  history(@Param() p: AccountParams): Promise<AccountHistory> {
    return this.queryBus.execute(new GetAccountHistoryQuery(p.type, p.externalId));
  }

  @Put('subscription')
  @ApiOperation({
    summary: 'Assign a plan',
    description:
      "Puts the account on the plan's current version and closes the running subscription. Creates the " +
      'billing account on first use. Assigning the plan the account is already on moves it to the latest version.',
  })
  @ApiOkResponse({ type: AccountOverviewResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown plan' })
  @ApiConflictResponse({ description: 'The account changed meanwhile' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Archived plan, wrong audience, bad period' })
  assign(
    @Param() p: AccountParams,
    @Body() body: AssignPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AccountOverview> {
    return this.commandBus.execute(
      new AssignPlanCommand(p.type, p.externalId, body.planCode, body.status ?? 'active', body.periodEnd ?? null, user.userId),
    );
  }

  @Delete('subscription')
  @ApiOperation({ summary: 'Cancel the current subscription', description: "The account falls back to its audience's free plan" })
  @ApiOkResponse({ type: AccountOverviewResponseDto })
  @ApiNotFoundResponse({ description: 'The payer has no billing account yet' })
  @ApiConflictResponse({ description: 'The account changed meanwhile' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'No current subscription' })
  cancel(@Param() p: AccountParams, @CurrentUser() user: AuthenticatedUser): Promise<AccountOverview> {
    return this.commandBus.execute(new CancelSubscriptionCommand(p.type, p.externalId, user.userId));
  }

  @Post('grants')
  @ApiOperation({
    summary: 'Grant a key or credits on top of the plan',
    description: 'Switches the key on for the term even where the plan has it off; credits add to the plan\'s',
  })
  @ApiCreatedResponse({ type: AccountOverviewResponseDto })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Unknown key, bad credits/limits, no reason, bad term' })
  issueGrant(
    @Param() p: AccountParams,
    @Body() body: IssueGrantDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AccountOverview> {
    return this.commandBus.execute(
      new IssueGrantCommand(
        p.type,
        p.externalId,
        {
          featureKey: body.featureKey,
          monthlyCredits: body.monthlyCredits ?? null,
          limits: body.limits ?? {},
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          reason: body.reason,
        },
        user.userId,
      ),
    );
  }

  @Post('grants/:grantId/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke a grant now' })
  @ApiOkResponse({ type: AccountOverviewResponseDto })
  @ApiNotFoundResponse({ description: 'No such account or grant' })
  @ApiConflictResponse({ description: 'Revoked by someone else meanwhile' })
  @ApiUnprocessableEntityResponse({ type: BusinessErrorDto, description: 'Already revoked or already ended' })
  revokeGrant(@Param() p: GrantParams, @CurrentUser() user: AuthenticatedUser): Promise<AccountOverview> {
    return this.commandBus.execute(new RevokeGrantCommand(p.type, p.externalId, p.grantId, user.userId));
  }
}
