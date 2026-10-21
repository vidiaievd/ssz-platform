import { Injectable } from '@nestjs/common';
import type { AiPayerEntitlements as PrismaRow } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { BilledPayer, IEntitlementProjection } from '../application/ports/entitlement-projection.js';
import type { FeatureGrant, PayerEntitlements } from '../domain/entitlement.js';

@Injectable()
export class PrismaEntitlementProjection implements IEntitlementProjection {
  constructor(private readonly prisma: PrismaService) {}

  async get(payer: BilledPayer): Promise<PayerEntitlements | null> {
    const row = await this.prisma.aiPayerEntitlements.findUnique({
      where: { payerType_payerId: { payerType: payer.type, payerId: payer.id } },
    });
    return row ? toSnapshot(row) : null;
  }

  /**
   * A guarded update, then an insert that yields to a row already there — the guard is the
   * domain's `supersedes`, in SQL, so two writers of one payer cannot undo each other.
   */
  async save(payer: BilledPayer, s: PayerEntitlements): Promise<boolean> {
    const data = {
      version: s.version,
      features: s.features as object,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      validUntil: s.validUntil,
      receivedAt: new Date(),
    };
    const update = () =>
      this.prisma.aiPayerEntitlements.updateMany({
        where: {
          payerType: payer.type,
          payerId: payer.id,
          OR: [{ version: { lt: s.version } }, { version: s.version, validUntil: { lte: s.validUntil } }],
        },
        data,
      });

    if ((await update()).count > 0) return true;
    const created = await this.prisma.aiPayerEntitlements.createMany({
      data: [{ payerType: payer.type, payerId: payer.id, ...data }],
      skipDuplicates: true,
    });
    if (created.count > 0) return true;
    // Either the row held supersedes this one, or it was inserted between the two writes.
    return (await update()).count > 0;
  }
}

function toSnapshot(row: PrismaRow): PayerEntitlements {
  return {
    features: row.features as unknown as Record<string, FeatureGrant>,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    validUntil: row.validUntil,
    version: row.version,
  };
}
