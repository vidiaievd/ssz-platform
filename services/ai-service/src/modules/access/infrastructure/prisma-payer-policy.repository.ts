import { Injectable } from '@nestjs/common';
import type { AiPayerPolicy as PrismaPolicy } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { IPayerPolicyRepository } from '../application/ports/payer-policy.repository.js';
import type { BilledPayerType, Payer } from '../domain/payer.js';
import type { PayerPolicy, StoredPayerPolicy } from '../domain/payer-policy.js';

@Injectable()
export class PrismaPayerPolicyRepository implements IPayerPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(payer: Payer): Promise<StoredPayerPolicy | null> {
    const row = await this.prisma.aiPayerPolicy.findUnique({
      where: { payerType_payerId: { payerType: payer.type, payerId: payer.id } },
    });
    return row ? toPolicy(row) : null;
  }

  async save(payer: { type: BilledPayerType; id: string }, policy: PayerPolicy, updatedBy: string): Promise<StoredPayerPolicy> {
    // An empty list stands for "any region": Prisma cannot store a null list.
    const data = { aiEnabled: policy.aiEnabled, allowedRegions: policy.allowedRegions ?? [], updatedBy };
    const row = await this.prisma.aiPayerPolicy.upsert({
      where: { payerType_payerId: { payerType: payer.type, payerId: payer.id } },
      create: { payerType: payer.type, payerId: payer.id, ...data },
      update: data,
    });
    return toPolicy(row);
  }
}

function toPolicy(row: PrismaPolicy): StoredPayerPolicy {
  return {
    payerType: row.payerType as BilledPayerType,
    payerId: row.payerId,
    aiEnabled: row.aiEnabled,
    allowedRegions: row.allowedRegions.length > 0 ? row.allowedRegions : null,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}
