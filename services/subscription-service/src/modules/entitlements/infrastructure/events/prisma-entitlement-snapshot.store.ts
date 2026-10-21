import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EXCHANGES } from '@ssz/contracts';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { BillingAccountType } from '../../../accounts/domain/billing-account.js';
import type { IEntitlementSnapshotStore } from '../../application/ports/entitlement-snapshot.store.js';
import type { Entitlements } from '../../domain/entitlements.js';
import { toEntitlementsChangedEvent } from './entitlements-event.mapper.js';

@Injectable()
export class PrismaEntitlementSnapshotStore implements IEntitlementSnapshotStore {
  constructor(private readonly prisma: PrismaService) {}

  async pending(limit: number): Promise<{ type: BillingAccountType; externalId: string }[]> {
    return this.prisma.billingAccount.findMany({
      where: { publishedRevision: { lt: this.prisma.billingAccount.fields.revision } },
      select: { type: true, externalId: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async publish(snapshot: Entitlements): Promise<boolean> {
    const now = new Date();
    const event = toEntitlementsChangedEvent(snapshot, now);
    return this.prisma.$transaction(async (tx) => {
      // The guard makes a slower, older snapshot lose to one already sent.
      const marked = await tx.billingAccount.updateMany({
        where: {
          type: snapshot.account.type,
          externalId: snapshot.account.externalId,
          publishedRevision: { lt: snapshot.version },
        },
        data: { publishedRevision: snapshot.version, nextRefreshAt: snapshot.validUntil },
      });
      if (marked.count === 0) return false;
      await tx.outbox.create({
        data: {
          id: randomUUID(),
          eventId: event.eventId,
          eventType: event.eventType,
          exchange: EXCHANGES.SUBSCRIPTION!,
          routingKey: event.eventType,
          payload: JSON.stringify(event),
          correlationId: null,
          occurredAt: now,
        },
      });
      return true;
    });
  }
}
