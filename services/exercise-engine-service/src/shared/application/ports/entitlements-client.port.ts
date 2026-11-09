import type { Result } from '../../kernel/result.js';

export const ENTITLEMENTS_CLIENT = Symbol('IEntitlementsClient');

/** Who pays for a feature: a workspace (school, SOLO included) or a self-study learner (plan 78). */
export interface Payer {
  type: 'workspace' | 'user';
  id: string;
}

export class EntitlementsClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'EntitlementsClientError';
  }
}

/**
 * subscription-service's `GET /internal/entitlements` (plan 78), asked only whether one
 * feature key is on.
 *
 * Whether the payer has credits left for it is not asked: that is ai-service's gate, which
 * decides again before any call. The engine only needs to know whether anyone could answer.
 */
export interface IEntitlementsClient {
  isEnabled(payer: Payer, featureKey: string): Promise<Result<boolean, EntitlementsClientError>>;
}

export const ENTITLEMENT_LIMITS_CLIENT = Symbol('IEntitlementLimitsClient');

/** One feature key of the payer's plan with its named limits (`perLearnerMonthlyCredits`, …). */
export interface FeatureEntitlement {
  enabled: boolean;
  /** Only the limits the plan sets; a name absent is no limit from the plan. */
  limits: Record<string, number>;
}

/**
 * The same read, for the one caller that needs a key's limits as well (plan 84, step 5: the
 * plan's `perLearnerMonthlyCredits` of `ai.practice` caps the school's own). Kept apart from
 * `IEntitlementsClient` so callers asking only "on or off" are not handed limits they ignore.
 */
export interface IEntitlementLimitsClient {
  feature(payer: Payer, featureKey: string): Promise<Result<FeatureEntitlement, EntitlementsClientError>>;
}
