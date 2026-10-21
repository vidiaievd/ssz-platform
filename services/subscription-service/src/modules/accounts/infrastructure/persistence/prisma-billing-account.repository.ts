import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IBillingAccountRepository } from '../../application/ports/billing-account.repository.js';
import { BillingAccount, type BillingAccountType } from '../../domain/billing-account.js';
import { toSubscription, withPlan } from './account.mapper.js';

const openSubscriptions = {
  subscriptions: { where: { status: { in: ['trial', 'active'] } }, include: withPlan, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.BillingAccountInclude;

type AccountRow = Prisma.BillingAccountGetPayload<{ include: typeof openSubscriptions }>;

class RevisionConflict extends Error {}

@Injectable()
export class PrismaBillingAccountRepository implements IBillingAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(type: BillingAccountType, externalId: string): Promise<BillingAccount | null> {
    const row = await this.prisma.billingAccount.findUnique({
      where: { type_externalId: { type, externalId } },
      include: openSubscriptions,
    });
    return row ? toAccount(row) : null;
  }

  async ensure(type: BillingAccountType, externalId: string): Promise<BillingAccount> {
    const row = await this.prisma.billingAccount.upsert({
      where: { type_externalId: { type, externalId } },
      create: { type, externalId },
      update: {},
      include: openSubscriptions,
    });
    return toAccount(row);
  }

  async save(account: BillingAccount): Promise<Result<void, 'version_conflict'>> {
    const changed = account.changedSubscriptions();
    try {
      await this.prisma.$transaction(async (tx) => {
        // Claiming the revision first serialises writers: the loser's update matches no row.
        const claimed = await tx.billingAccount.updateMany({
          where: { id: account.id, revision: account.revision },
          data: { revision: { increment: 1 } },
        });
        if (claimed.count === 0) throw new RevisionConflict();
        for (const s of changed) {
          await tx.subscription.upsert({
            where: { id: s.id },
            create: {
              id: s.id,
              accountId: s.accountId,
              planId: s.planId,
              planVersion: s.planVersion,
              status: s.status,
              periodStart: s.periodStart,
              periodEnd: s.periodEnd,
              createdBy: s.createdBy,
              createdAt: s.createdAt,
              endedAt: s.endedAt,
              endedBy: s.endedBy,
            },
            update: { status: s.status, endedAt: s.endedAt, endedBy: s.endedBy },
          });
        }
      });
      return Result.ok();
    } catch (err) {
      if (err instanceof RevisionConflict) return Result.fail('version_conflict');
      throw err;
    }
  }
}

function toAccount(row: AccountRow): BillingAccount {
  return BillingAccount.restore({
    id: row.id,
    type: row.type,
    externalId: row.externalId,
    createdAt: row.createdAt,
    revision: row.revision,
    openSubscriptions: row.subscriptions.map(toSubscription),
  });
}
