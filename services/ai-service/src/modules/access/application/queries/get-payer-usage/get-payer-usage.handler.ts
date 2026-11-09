import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { AI_FEATURE_KEYS } from '../../../domain/entitlement.js';
import type { Payer } from '../../../domain/payer.js';
import { FeatureUsage } from '../../feature-usage.js';
import { ENTITLEMENT_READER, type IEntitlementReader } from '../../ports/entitlement.reader.js';
import { PAYER_POLICY_REPOSITORY, type IPayerPolicyRepository } from '../../ports/payer-policy.repository.js';
import { effectivePayerPolicy, type EffectivePayerPolicy } from '../get-payer-policy/get-payer-policy.handler.js';
import { GetPayerUsageQuery } from './get-payer-usage.query.js';

/** One AI key of the payer. A key that is off (or that the tariff does not mention) has no spend. */
export interface PayerFeatureUsage {
  featureKey: string;
  enabled: boolean;
  /** Credits spent this period, six decimals; null when the key is off. */
  used: string | null;
  /** The period's allowance; null when unmetered or off. */
  total: string | null;
  /** Null when the key is off. */
  periodEnd: Date | null;
  /** The tariff's limits of the key as resolved (per-learner caps etc.); empty when off. */
  limits: Record<string, unknown>;
}

export type PayerUsage =
  | { kind: 'usage'; policy: EffectivePayerPolicy; features: PayerFeatureUsage[] }
  /** The tariff or the ledger could not be read. */
  | { kind: 'unavailable' };

/**
 * What the admin panel's «AI and services» tab shows for a school or a learner: every AI key
 * in catalog order, on or off as the gate would see it, with the same spend the learner's own
 * readout counts (`FeatureUsage`), plus the payer policy in force. A payer subscription-service
 * does not know reads as its audience's free plan, never as 404.
 *
 * `enabled` is the tariff only: a policy with `aiEnabled: false` refuses every key on top of it
 * — the panel shows both.
 */
@QueryHandler(GetPayerUsageQuery)
export class GetPayerUsageHandler implements IQueryHandler<GetPayerUsageQuery, PayerUsage> {
  private readonly logger = new Logger(GetPayerUsageHandler.name);

  constructor(
    @Inject(ENTITLEMENT_READER) private readonly entitlements: IEntitlementReader,
    @Inject(PAYER_POLICY_REPOSITORY) private readonly policies: IPayerPolicyRepository,
    private readonly usage: FeatureUsage,
  ) {}

  async execute({ payerType, payerId }: GetPayerUsageQuery): Promise<PayerUsage> {
    const payer: Payer = { type: payerType, id: payerId };
    const policy = effectivePayerPolicy(payerType, payerId, await this.policies.get(payer));

    const features: PayerFeatureUsage[] = [];
    try {
      // One key at a time: the first read may fetch a stale tariff through and store it, so
      // the rest read the projection instead of asking subscription-service again.
      for (const featureKey of AI_FEATURE_KEYS) {
        const feature = await this.entitlements.getFeature(payer, featureKey);
        if (!feature?.enabled) {
          features.push({ featureKey, enabled: false, used: null, total: null, periodEnd: null, limits: {} });
          continue;
        }
        const usage = await this.usage.read(payer, featureKey, feature);
        features.push({ ...usage, enabled: true, limits: feature.limits });
      }
    } catch (err) {
      this.logger.warn({ err, payerType, payerId }, 'Usage of the payer unreadable');
      return { kind: 'unavailable' };
    }
    return { kind: 'usage', policy, features };
  }
}
