import { Inject, Injectable } from '@nestjs/common';
import { LEDGER_USAGE_READER, type ILedgerUsageReader } from '../../ledger/application/ports/ledger-usage.reader.js';
import { formatMicroCredits, microCredits } from '../../ledger/domain/credits.js';
import type { FeatureEntitlement } from '../domain/entitlement.js';
import type { Payer } from '../domain/payer.js';
import { QUOTA_COUNTER, type IQuotaCounter } from './ports/quota-counter.js';

export interface AiUsage {
  featureKey: string;
  /** Credits spent this period, six decimals. May pass `total`: calls in flight together overshoot (see AccessGate). */
  used: string;
  /** The period's allowance, six decimals; null = unmetered. */
  total: string | null;
  periodEnd: Date;
}

/**
 * What a payer has spent on one AI key this period — the learner's own readout (`ai/usage/me`)
 * and the admin panel's (`admin/ai/usage/...`) read it the same way.
 *
 * `used` is the larger of the ledger and the gate's counter: the counter runs ahead while
 * ledger rows wait in the spool, and it is what the gate refuses on, so the readout never
 * shows credits left that a call would be refused for. A counter that cannot be read leaves
 * the ledger alone; this read never starts a counter. A ledger that cannot be read throws.
 */
@Injectable()
export class FeatureUsage {
  constructor(
    @Inject(LEDGER_USAGE_READER) private readonly usage: ILedgerUsageReader,
    @Inject(QUOTA_COUNTER) private readonly counter: IQuotaCounter,
  ) {}

  /** `feature` is the payer's entitlement to `featureKey` (`ai.<pool>`), switched on. */
  async read(payer: Payer, featureKey: string, feature: FeatureEntitlement): Promise<AiUsage> {
    const pool = featureKey.slice('ai.'.length);
    const spent = await this.usage.microCreditsSpent(payer, pool, feature.periodStart, feature.periodEnd);
    const counted = await this.counted(payer, pool, feature);
    const used = counted !== null && counted > spent ? counted : spent;
    return {
      featureKey,
      used: formatMicroCredits(used),
      total: feature.monthlyCredits === null ? null : formatMicroCredits(microCredits(feature.monthlyCredits)),
      periodEnd: feature.periodEnd,
    };
  }

  private async counted(payer: Payer, pool: string, feature: FeatureEntitlement): Promise<bigint | null> {
    // Unmetered: the gate keeps no counter.
    if (feature.monthlyCredits === null) return null;
    try {
      return await this.counter.get({ payer, capability: pool, periodStart: feature.periodStart, periodEnd: feature.periodEnd });
    } catch {
      return null;
    }
  }
}
