import { Logger } from '@nestjs/common';
import { featureOf, isStale, type FeatureEntitlement } from '../domain/entitlement.js';
import type { Payer } from '../domain/payer.js';
import type { IEntitlementProjection } from './ports/entitlement-projection.js';
import type { IEntitlementReader } from './ports/entitlement.reader.js';
import type { ISubscriptionClient } from './ports/subscription.client.js';

/**
 * Plan 78 §6: the tariff read from the local projection of `subscription.entitlements.changed`.
 *
 * No row (the event has not arrived, or the payer predates subscription-service) or a row
 * past its `validUntil` (a period rolled over, a grant ran out — the fresh event follows
 * within a minute) → subscription-service's internal API is asked and its answer stored, so
 * the next call reads locally again. That read failing throws, and the gate refuses the
 * call: a stale snapshot could still hold a grant that has ended.
 *
 * Built by a factory in `access.module.ts` (the clock is not injectable).
 */
export class ProjectedEntitlementReader implements IEntitlementReader {
  private readonly logger = new Logger(ProjectedEntitlementReader.name);

  constructor(
    private readonly projection: IEntitlementProjection,
    private readonly subscriptions: ISubscriptionClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getFeature(payer: Payer, featureKey: string): Promise<FeatureEntitlement | null> {
    // The platform has no tariff; the gate never asks for it.
    if (payer.type === 'platform') return null;
    const billed = { type: payer.type, id: payer.id };

    let snapshot = await this.projection.get(billed);
    if (!snapshot || isStale(snapshot, this.clock())) {
      const fetched = await this.subscriptions.fetchEntitlements(billed);
      // A fresher event may have landed meanwhile; the projection keeps whichever wins.
      const stored = await this.projection.save(billed, fetched);
      if (stored) this.logger.debug(`Entitlements of ${payer.type} ${payer.id} read through (v${fetched.version})`);
      snapshot = stored ? fetched : ((await this.projection.get(billed)) ?? fetched);
    }
    return featureOf(snapshot, featureKey);
  }
}
