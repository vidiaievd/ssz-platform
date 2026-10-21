import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AccountHistory, AccountOverview } from '../../application/account-views.js';
import type { IAccountReader } from '../../application/ports/account.reader.js';
import type { BillingAccountType } from '../../domain/billing-account.js';
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
}
