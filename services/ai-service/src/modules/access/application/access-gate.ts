import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiRegion } from '../../registry/domain/registry.types.js';
import { Result } from '../../../shared/kernel/result.js';
import { featureKeyOf, type FeatureEntitlement } from '../domain/entitlement.js';
import type { Payer } from '../domain/payer.js';
import { DEFAULT_POLICY } from '../domain/payer-policy.js';
import type { RefusalCode } from '../domain/refusal.js';
import { ENTITLEMENT_READER, type IEntitlementReader } from './ports/entitlement.reader.js';
import { PAYER_POLICY_REPOSITORY, type IPayerPolicyRepository } from './ports/payer-policy.repository.js';

/** What the gate lets through, and on which terms the router must call. */
export interface GateGrant {
  /** Null = any region. */
  allowedRegions: AiRegion[] | null;
  /** The payer's entitlement to this agent; null for the platform, which has none. */
  feature: FeatureEntitlement | null;
}

export type GateFailure =
  | { kind: 'refused'; code: RefusalCode }
  /** The gate could not read what it must check — the call is refused, not let through. */
  | { kind: 'gate_unavailable' };

/**
 * Before any model: is this payer allowed this agent at all, and where may its data go.
 *
 * Fails closed: a policy or tariff that cannot be read refuses the call — an EU-only school
 * must never be sent to a US model because the database blinked. (The quota counter of
 * step 9b fails open instead; the ledger catches up with it.)
 *
 * The platform pays for admin checks only and has neither a policy nor a tariff.
 */
@Injectable()
export class AccessGate {
  private readonly logger = new Logger(AccessGate.name);

  constructor(
    @Inject(PAYER_POLICY_REPOSITORY) private readonly policies: IPayerPolicyRepository,
    @Inject(ENTITLEMENT_READER) private readonly entitlements: IEntitlementReader,
  ) {}

  async check(capability: string, payer: Payer): Promise<Result<GateGrant, GateFailure>> {
    if (payer.type === 'platform') return Result.ok({ allowedRegions: null, feature: null });

    try {
      const policy = (await this.policies.get(payer)) ?? DEFAULT_POLICY;
      if (!policy.aiEnabled) return Result.fail({ kind: 'refused', code: 'ai_disabled' });

      const feature = await this.entitlements.getFeature(payer, featureKeyOf(capability));
      if (!feature?.enabled) return Result.fail({ kind: 'refused', code: 'not_entitled' });

      return Result.ok({ allowedRegions: policy.allowedRegions, feature });
    } catch (err) {
      this.logger.error(
        { err, capability, payer },
        'Access gate could not read the payer policy or entitlement; refusing the call',
      );
      return Result.fail({ kind: 'gate_unavailable' });
    }
  }
}
