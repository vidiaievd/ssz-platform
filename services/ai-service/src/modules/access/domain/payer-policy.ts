import type { AiRegion } from '../../registry/domain/registry.types.js';
import type { BilledPayerType } from './payer.js';

/**
 * A payer's own rules for AI (plan 48 §4): a school may switch AI off entirely or allow
 * only EU processing. Not a tariff — that is the entitlement.
 *
 * Regions are matched literally against the provider's region: an EU-only school that also
 * runs its own model lists `['eu', 'local']`; `global` is a region of its own, not "any".
 */
export interface PayerPolicy {
  aiEnabled: boolean;
  /** Null = any region. Never empty. */
  allowedRegions: AiRegion[] | null;
}

export interface StoredPayerPolicy extends PayerPolicy {
  payerType: BilledPayerType;
  payerId: string;
  updatedBy: string;
  updatedAt: Date;
}

/** What a payer without a stored policy gets. */
export const DEFAULT_POLICY: PayerPolicy = { aiEnabled: true, allowedRegions: null };

export function regionAllowed(policy: Pick<PayerPolicy, 'allowedRegions'>, region: AiRegion): boolean {
  return policy.allowedRegions === null || policy.allowedRegions.includes(region);
}
