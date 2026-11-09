import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IGrantRepository } from '../../application/ports/grant.repository.js';
import type { Grant } from '../../domain/grant.js';
import { toGrant } from './account.mapper.js';

@Injectable()
export class PrismaGrantRepository implements IGrantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(accountId: string, grantId: string): Promise<Grant | null> {
    const row = await this.prisma.grant.findFirst({ where: { id: grantId, accountId } });
    return row ? toGrant(row) : null;
  }

  async listLive(accountId: string, now: Date): Promise<Grant[]> {
    const rows = await this.prisma.grant.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: now } } });
    return rows.map(toGrant);
  }

  // Both writes bump the account's revision: it is the version of the account's
  // entitlements, and a grant changes them as much as a subscription does.

  async insert(grant: Grant): Promise<void> {
    const g = grant.snapshot;
    await this.prisma.$transaction([
      this.prisma.grant.create({
        data: {
          id: g.id,
          accountId: g.accountId,
          featureKey: g.featureKey,
          monthlyCredits: g.monthlyCredits,
          limits: g.limits as Prisma.InputJsonValue,
          startsAt: g.startsAt,
          endsAt: g.endsAt,
          reason: g.reason,
          createdBy: g.createdBy,
          createdAt: g.createdAt,
        },
      }),
      this.bumpRevision(g.accountId),
    ]);
  }

  async saveRevocation(grant: Grant): Promise<Result<void, 'version_conflict'>> {
    const g = grant.snapshot;
    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.grant.updateMany({
        where: { id: g.id, revokedAt: null },
        data: { revokedAt: g.revokedAt, revokedBy: g.revokedBy },
      });
      if (updated.count === 0) return false;
      await tx.billingAccount.update({ where: { id: g.accountId }, data: { revision: { increment: 1 } } });
      return true;
    });
    return revoked ? Result.ok() : Result.fail('version_conflict');
  }

  private bumpRevision(accountId: string) {
    return this.prisma.billingAccount.update({ where: { id: accountId }, data: { revision: { increment: 1 } } });
  }
}
