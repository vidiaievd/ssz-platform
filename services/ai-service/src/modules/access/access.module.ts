import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { AccessGate } from './application/access-gate.js';
import { PutPayerPolicyHandler } from './application/commands/put-payer-policy/put-payer-policy.handler.js';
import { ENTITLEMENT_PROJECTION, type IEntitlementProjection } from './application/ports/entitlement-projection.js';
import { ENTITLEMENT_READER } from './application/ports/entitlement.reader.js';
import { PAYER_POLICY_REPOSITORY } from './application/ports/payer-policy.repository.js';
import { QUOTA_COUNTER } from './application/ports/quota-counter.js';
import { QUOTA_RECONCILE_INTERVAL_MS, QuotaReconciler } from './application/quota-reconciler.js';
import { GetMyUsageHandler } from './application/queries/get-my-usage/get-my-usage.handler.js';
import { GetPayerPolicyHandler } from './application/queries/get-payer-policy/get-payer-policy.handler.js';
import { SUBSCRIPTION_CLIENT, type ISubscriptionClient } from './application/ports/subscription.client.js';
import { ProjectedEntitlementReader } from './application/projected-entitlement.reader.js';
import { HttpSubscriptionClient } from './infrastructure/http-subscription.client.js';
import { PrismaEntitlementProjection } from './infrastructure/prisma-entitlement-projection.js';
import { PrismaPayerPolicyRepository } from './infrastructure/prisma-payer-policy.repository.js';
import { RedisQuotaCounter } from './infrastructure/redis-quota-counter.js';
import { AdminPayerPoliciesController } from './presentation/admin-payer-policies.controller.js';
import { EntitlementsChangedConsumer } from './presentation/events/entitlements-changed.consumer.js';
import { UsageController } from './presentation/usage.controller.js';

/**
 * Who may call which agent, and where the data may go: payer policies (here), the tariff
 * (projected from subscription-service, plan 78 §6), and the quota counters in Redis with
 * their reconciler. The gateway asks `AccessGate` before the router and has it
 * charge the call's credits after. Learners read their own plan's credits at `ai/usage/me`.
 */
@Module({
  imports: [LedgerModule],
  controllers: [AdminPayerPoliciesController, UsageController],
  providers: [
    AccessGate,
    GetPayerPolicyHandler,
    PutPayerPolicyHandler,
    GetMyUsageHandler,
    { provide: PAYER_POLICY_REPOSITORY, useClass: PrismaPayerPolicyRepository },
    { provide: QUOTA_COUNTER, useClass: RedisQuotaCounter },
    {
      provide: QUOTA_RECONCILE_INTERVAL_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => config.get<number>('quotaReconcileMs')!,
    },
    QuotaReconciler,
    { provide: ENTITLEMENT_PROJECTION, useClass: PrismaEntitlementProjection },
    {
      provide: SUBSCRIPTION_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpSubscriptionClient(
          config.get<string>('subscriptionServiceUrl')!,
          config.get<string>('internalServiceToken')!,
        ),
    },
    {
      provide: ENTITLEMENT_READER,
      inject: [ENTITLEMENT_PROJECTION, SUBSCRIPTION_CLIENT],
      useFactory: (projection: IEntitlementProjection, subscriptions: ISubscriptionClient) =>
        new ProjectedEntitlementReader(projection, subscriptions),
    },
    EntitlementsChangedConsumer,
  ],
  exports: [AccessGate],
})
export class AccessModule {}
