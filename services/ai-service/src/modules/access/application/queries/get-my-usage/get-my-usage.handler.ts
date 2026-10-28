import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { formatMicroCredits, microCredits } from '../../../../ledger/domain/credits.js';
import { LEDGER_USAGE_READER, type ILedgerUsageReader } from '../../../../ledger/application/ports/ledger-usage.reader.js';
import type { FeatureEntitlement } from '../../../domain/entitlement.js';
import type { Payer } from '../../../domain/payer.js';
import { ENTITLEMENT_READER, type IEntitlementReader } from '../../ports/entitlement.reader.js';
import { QUOTA_COUNTER, type IQuotaCounter } from '../../ports/quota-counter.js';
import { GetMyUsageQuery } from './get-my-usage.query.js';

export interface AiUsage {
  featureKey: string;
  /** Credits spent this period, six decimals. May pass `total`: calls in flight together overshoot (see AccessGate). */
  used: string;
  /** The period's allowance, six decimals; null = unmetered. */
  total: string | null;
  periodEnd: Date;
}

export type MyUsage =
  | { kind: 'usage'; usage: AiUsage }
  /** The learner's plan does not carry the key, or carries it switched off. */
  | { kind: 'not_entitled' }
  /** The tariff or the ledger could not be read. */
  | { kind: 'unavailable' };

/**
 * The learner's own account only (payer `user`) — what a school pays for is the school's to
 * read. `used` is the larger of the ledger and the gate's counter: the counter runs ahead
 * while ledger rows wait in the spool, and it is what the gate refuses on, so the readout
 * never shows credits left that a call would be refused for. A counter that cannot be read
 * leaves the ledger alone; this read never starts a counter.
 */
@QueryHandler(GetMyUsageQuery)
export class GetMyUsageHandler implements IQueryHandler<GetMyUsageQuery, MyUsage> {
  private readonly logger = new Logger(GetMyUsageHandler.name);

  constructor(
    @Inject(ENTITLEMENT_READER) private readonly entitlements: IEntitlementReader,
    @Inject(LEDGER_USAGE_READER) private readonly usage: ILedgerUsageReader,
    @Inject(QUOTA_COUNTER) private readonly counter: IQuotaCounter,
  ) {}

  async execute({ userId, featureKey }: GetMyUsageQuery): Promise<MyUsage> {
    const payer: Payer = { type: 'user', id: userId };
    const capability = featureKey.slice('ai.'.length);

    let feature: FeatureEntitlement | null;
    let spent: bigint;
    try {
      feature = await this.entitlements.getFeature(payer, featureKey);
      if (!feature?.enabled) return { kind: 'not_entitled' };
      spent = await this.usage.microCreditsSpent(payer, capability, feature.periodStart, feature.periodEnd);
    } catch (err) {
      this.logger.warn({ err, featureKey, userId }, 'Usage of the learner unreadable');
      return { kind: 'unavailable' };
    }

    const counted = await this.counted(payer, capability, feature);
    const used = counted !== null && counted > spent ? counted : spent;
    return {
      kind: 'usage',
      usage: {
        featureKey,
        used: formatMicroCredits(used),
        total: feature.monthlyCredits === null ? null : formatMicroCredits(microCredits(feature.monthlyCredits)),
        periodEnd: feature.periodEnd,
      },
    };
  }

  private async counted(payer: Payer, capability: string, feature: FeatureEntitlement): Promise<bigint | null> {
    // Unmetered: the gate keeps no counter.
    if (feature.monthlyCredits === null) return null;
    try {
      return await this.counter.get({ payer, capability, periodStart: feature.periodStart, periodEnd: feature.periodEnd });
    } catch {
      return null;
    }
  }
}
