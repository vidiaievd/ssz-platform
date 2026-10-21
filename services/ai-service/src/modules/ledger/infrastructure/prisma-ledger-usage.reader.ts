import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { Payer } from '../../access/domain/payer.js';
import type { ILedgerUsageReader } from '../application/ports/ledger-usage.reader.js';
import { microCredits } from '../domain/credits.js';

@Injectable()
export class PrismaLedgerUsageReader implements ILedgerUsageReader {
  constructor(private readonly prisma: PrismaService) {}

  async microCreditsSpent(payer: Payer, capability: string, from: Date, to: Date): Promise<bigint> {
    // Served by the (payer_type, payer_id, capability, created_at) index.
    const { _sum } = await this.prisma.aiCall.aggregate({
      where: { payerType: payer.type, payerId: payer.id, capability, createdAt: { gte: from, lt: to } },
      _sum: { credits: true },
    });
    // toFixed: a Decimal prints tiny sums in exponent form otherwise.
    return _sum.credits ? microCredits(_sum.credits.toFixed(6)) : 0n;
  }
}
