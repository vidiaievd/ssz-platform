import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AccountHistory, AccountOverview, LookupRows } from '../../application/account-views.js';
import type { IAccountReader } from '../../application/ports/account.reader.js';
import { audienceFor, type BillingAccountType } from '../../domain/billing-account.js';
import { FREE_PLAN_CODES } from '../../../entitlements/domain/entitlements.js';
import { isCurrent } from '../../domain/subscription.js';
import { toGrantView, toSubscription, toSubscriptionView, withPlan } from './account.mapper.js';

@Injectable()
export class PrismaAccountReader implements IAccountReader {
  constructor(private readonly prisma: PrismaService) {}

  async overview(type: BillingAccountType, externalId: string, now: Date): Promise<AccountOverview | null> {
    const row = await this.prisma.billingAccount.findUnique({
      where: { type_externalId: { type, externalId } },
      include: {
        subscriptions: { where: { status: { in: ['trial', 'active'] } }, include: withPlan },
        grants: { where: { revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: 'asc' } },
      },
    });
    if (!row) return null;
    const current = row.subscriptions.find((s) => isCurrent(toSubscription(s), now));
    return {
      account: { id: row.id, type: row.type, externalId: row.externalId, createdAt: row.createdAt },
      subscription: current ? toSubscriptionView(current) : null,
      grants: row.grants.map((g) => toGrantView(g, now)),
    };
  }

  async history(type: BillingAccountType, externalId: string, now: Date): Promise<AccountHistory | null> {
    const row = await this.prisma.billingAccount.findUnique({
      where: { type_externalId: { type, externalId } },
      include: {
        subscriptions: { include: withPlan, orderBy: { createdAt: 'desc' } },
        grants: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) return null;
    return {
      account: { id: row.id, type: row.type, externalId: row.externalId, createdAt: row.createdAt },
      subscriptions: row.subscriptions.map(toSubscriptionView),
      grants: row.grants.map((g) => toGrantView(g, now)),
    };
  }

  async lookup(type: BillingAccountType, externalIds: string[], now: Date): Promise<LookupRows> {
    const [accounts, free] = await Promise.all([
      this.prisma.billingAccount.findMany({
        where: { type, externalId: { in: externalIds } },
        select: {
          externalId: true,
          subscriptions: { where: { status: { in: ['trial', 'active'] } }, include: withPlan },
          grants: {
            where: { revokedAt: null, endsAt: { gt: now } },
            select: { startsAt: true, endsAt: true, revokedAt: true },
          },
        },
      }),
      this.prisma.plan.findUnique({
        where: { code: FREE_PLAN_CODES[audienceFor(type)] },
        select: { code: true, name: true, currentVersion: true },
      }),
    ]);
    return {
      accounts: accounts.map((a) => ({
        externalId: a.externalId,
        openSubscriptions: a.subscriptions.map((s) => ({
          id: s.id,
          planCode: s.plan.code,
          planName: s.plan.name,
          planVersion: s.planVersion,
          status: s.status,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
        })),
        liveGrants: a.grants,
      })),
      freePlan: free ? { code: free.code, name: free.name, version: free.currentVersion } : null,
    };
  }
}
