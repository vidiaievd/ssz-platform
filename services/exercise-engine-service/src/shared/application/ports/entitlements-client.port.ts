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
