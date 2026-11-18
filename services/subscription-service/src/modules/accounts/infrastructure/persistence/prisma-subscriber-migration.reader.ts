import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { BillingAccountType } from '../../domain/billing-account.js';
import type { ISubscriberMigrationReader, MigrationScope } from '../../application/ports/subscriber-migration.reader.js';

@Injectable()
export class PrismaSubscriberMigrationReader implements ISubscriberMigrationReader {
  constructor(private readonly prisma: PrismaService) {}

  async countByVersion(scope: MigrationScope): Promise<{ version: number; subscribers: number }[]> {
    const rows = await this.prisma.subscription.groupBy({
      by: ['planVersion'],
      where: inScope(scope),
      _count: { _all: true },
      orderBy: { planVersion: 'asc' },
    });
    return rows.map((r) => ({ version: r.planVersion, subscribers: r._count._all }));
  }

  async accountsToMove(scope: MigrationScope, limit: number): Promise<{ type: BillingAccountType; externalId: string }[]> {
    const rows = await this.prisma.subscription.findMany({
      where: inScope(scope),
      select: { account: { select: { type: true, externalId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map((r) => r.account);
  }
}

/** Same rule as `isCurrent`: open and not run out. */
function inScope(scope: MigrationScope): Prisma.SubscriptionWhereInput {
  return {
    planId: scope.planId,
    planVersion: scope.fromVersions === null ? { lt: scope.toVersion } : { in: [...scope.fromVersions] },
    status: { in: ['trial', 'active'] },
    OR: [{ periodEnd: null }, { periodEnd: { gt: scope.now } }],
  };
}
