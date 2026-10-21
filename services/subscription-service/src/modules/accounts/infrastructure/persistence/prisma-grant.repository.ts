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

  async insert(grant: Grant): Promise<void> {
    const g = grant.snapshot;
    await this.prisma.grant.create({
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
    });
  }

  async saveRevocation(grant: Grant): Promise<Result<void, 'version_conflict'>> {
    const g = grant.snapshot;
    const updated = await this.prisma.grant.updateMany({
      where: { id: g.id, revokedAt: null },
      data: { revokedAt: g.revokedAt, revokedBy: g.revokedBy },
    });
    return updated.count === 0 ? Result.fail('version_conflict') : Result.ok();
  }
}
