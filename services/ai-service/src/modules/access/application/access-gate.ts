import { Inject, Injectable, Logger } from '@nestjs/common';
import { microCredits } from '../../ledger/domain/credits.js';
import { LEDGER_USAGE_READER, type ILedgerUsageReader } from '../../ledger/application/ports/ledger-usage.reader.js';
import type { AiRegion } from '../../registry/domain/registry.types.js';
import { Result } from '../../../shared/kernel/result.js';
import { featureKeyOf, type FeatureEntitlement } from '../domain/entitlement.js';
import type { Payer } from '../domain/payer.js';
import { DEFAULT_POLICY } from '../domain/payer-policy.js';
import type { QuotaInForce } from '../domain/quota.js';
import type { RefusalCode } from '../domain/refusal.js';
import { ENTITLEMENT_READER, type IEntitlementReader } from './ports/entitlement.reader.js';
import { PAYER_POLICY_REPOSITORY, type IPayerPolicyRepository } from './ports/payer-policy.repository.js';
import { QUOTA_COUNTER, type IQuotaCounter } from './ports/quota-counter.js';

/** What the gate lets through, and on which terms the router must call. */
export interface GateGrant {
  /** Null = any region. */
  allowedRegions: AiRegion[] | null;
  /** The payer's entitlement to this agent; null for the platform, which has none. */
  feature: FeatureEntitlement | null;
  /** The counter to charge after the call; null without a quota or when the counter could not be read. */
  quota: QuotaInForce | null;
}

export type GateFailure =
  | { kind: 'refused'; code: RefusalCode }
  /** The gate could not read what it must check — the call is refused, not let through. */
  | { kind: 'gate_unavailable' };

/**
 * Before any model: is this payer allowed this agent at all, and where may its data go.
 *
 * Fails closed: a policy or tariff that cannot be read refuses the call — an EU-only school
 * must never be sent to a US model because the database blinked.
 *
 * The quota fails open instead: a counter that cannot be read lets the call through
 * uncounted, and the reconciler raises the counter to the ledger later. The check is made
 * before the call and the charge after it, so calls in flight together can overshoot the
 * allowance by their own cost — a reservation would close that, at a write per call.
 *
 * The platform pays for admin checks only and has neither a policy nor a tariff.
 */
@Injectable()
export class AccessGate {
  private readonly logger = new Logger(AccessGate.name);

  constructor(
    @Inject(PAYER_POLICY_REPOSITORY) private readonly policies: IPayerPolicyRepository,
    @Inject(ENTITLEMENT_READER) private readonly entitlements: IEntitlementReader,
    @Inject(QUOTA_COUNTER) private readonly counter: IQuotaCounter,
    @Inject(LEDGER_USAGE_READER) private readonly usage: ILedgerUsageReader,
  ) {}

  async check(capability: string, payer: Payer): Promise<Result<GateGrant, GateFailure>> {
    if (payer.type === 'platform') return Result.ok({ allowedRegions: null, feature: null, quota: null });

    let allowedRegions: AiRegion[] | null;
    let feature: FeatureEntitlement;
    try {
      const policy = (await this.policies.get(payer)) ?? DEFAULT_POLICY;
      if (!policy.aiEnabled) return Result.fail({ kind: 'refused', code: 'ai_disabled' });

      const found = await this.entitlements.getFeature(payer, featureKeyOf(capability));
      if (!found?.enabled) return Result.fail({ kind: 'refused', code: 'not_entitled' });
      allowedRegions = policy.allowedRegions;
      feature = found;
    } catch (err) {
      this.logger.error(
        { err, capability, payer },
        'Access gate could not read the payer policy or entitlement; refusing the call',
      );
      return Result.fail({ kind: 'gate_unavailable' });
    }

    const quota = await this.checkQuota(capability, payer, feature);
    if (quota === 'exhausted') return Result.fail({ kind: 'refused', code: 'quota_exhausted' });
    return Result.ok({ allowedRegions, feature, quota });
  }

  /** Adds a finished call's credits to the counter the gate checked. Never throws. */
  async charge(grant: GateGrant, credits: string | null): Promise<void> {
    if (!grant.quota || !credits) return;
    const micro = microCredits(credits);
    if (micro === 0n) return;
    try {
      await this.counter.charge(grant.quota.key, micro);
    } catch (err) {
      this.logger.warn({ err, key: grant.quota.key }, 'Quota counter not charged; the reconciler will catch up from the ledger');
    }
  }

  private async checkQuota(
    capability: string,
    payer: Payer,
    feature: FeatureEntitlement,
  ): Promise<QuotaInForce | 'exhausted' | null> {
    if (feature.monthlyCredits === null) return null;
    const limitMicro = microCredits(feature.monthlyCredits);
    const key = { payer, capability, periodStart: feature.periodStart, periodEnd: feature.periodEnd };
    try {
      let used = await this.counter.get(key);
      if (used === null) {
        used = await this.counter.init(
          key,
          await this.usage.microCreditsSpent(payer, capability, feature.periodStart, feature.periodEnd),
        );
      }
      return used >= limitMicro ? 'exhausted' : { key, limitMicro };
    } catch (err) {
      this.logger.warn({ err, capability, payer }, 'Quota counter unreadable; letting the call through uncounted');
      return null;
    }
  }
}
