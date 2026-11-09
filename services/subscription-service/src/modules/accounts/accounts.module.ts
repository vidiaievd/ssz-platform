import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module.js';
import { AssignPlanHandler } from './application/commands/assign-plan/assign-plan.handler.js';
import { CancelSubscriptionHandler } from './application/commands/cancel-subscription/cancel-subscription.handler.js';
import { CloseUserAccountHandler } from './application/commands/close-user-account/close-user-account.handler.js';
import { OpenAccountHandler } from './application/commands/open-account/open-account.handler.js';
import { RefreshDueAccountsHandler } from './application/commands/refresh-due-accounts/refresh-due-accounts.handler.js';
import { IssueGrantHandler } from './application/commands/issue-grant/issue-grant.handler.js';
import { RevokeGrantHandler } from './application/commands/revoke-grant/revoke-grant.handler.js';
import { ACCOUNT_READER } from './application/ports/account.reader.js';
import { BILLING_ACCOUNT_REPOSITORY } from './application/ports/billing-account.repository.js';
import { GRANT_REPOSITORY } from './application/ports/grant.repository.js';
import { GetAccountHistoryHandler } from './application/queries/get-account-history/get-account-history.handler.js';
import { GetAccountHandler } from './application/queries/get-account/get-account.handler.js';
import { PrismaAccountReader } from './infrastructure/persistence/prisma-account.reader.js';
import { PrismaBillingAccountRepository } from './infrastructure/persistence/prisma-billing-account.repository.js';
import { PrismaGrantRepository } from './infrastructure/persistence/prisma-grant.repository.js';
import { AdminAccountsController } from './presentation/controllers/admin-accounts.controller.js';
import { PayerCreatedConsumer } from './presentation/events/payer-created.consumer.js';
import { EntitlementRefreshJob } from './presentation/jobs/entitlement-refresh.job.js';

@Module({
  imports: [PlansModule],
  controllers: [AdminAccountsController],
  providers: [
    AssignPlanHandler,
    CancelSubscriptionHandler,
    CloseUserAccountHandler,
    IssueGrantHandler,
    RevokeGrantHandler,
    OpenAccountHandler,
    RefreshDueAccountsHandler,
    GetAccountHandler,
    GetAccountHistoryHandler,
    { provide: BILLING_ACCOUNT_REPOSITORY, useClass: PrismaBillingAccountRepository },
    { provide: GRANT_REPOSITORY, useClass: PrismaGrantRepository },
    { provide: ACCOUNT_READER, useClass: PrismaAccountReader },
    PayerCreatedConsumer,
    EntitlementRefreshJob,
  ],
})
export class AccountsModule {}
