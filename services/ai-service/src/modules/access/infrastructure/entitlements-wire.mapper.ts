import type { EntitlementsChangedPayload } from '@ssz/contracts';
import type { FeatureGrant, PayerEntitlements } from '../domain/entitlement.js';

/** The part of a snapshot the projection keeps; the internal API answers the same fields. */
export type EntitlementsWire = Pick<
  EntitlementsChangedPayload,
  'features' | 'periodStart' | 'periodEnd' | 'validUntil' | 'version'
>;

const CREDITS = /^\d+(\.\d{1,6})?$/;

/**
 * Event payload or internal-API body → snapshot. Throws on anything malformed: a wrong
 * snapshot stored would decide every call of the payer until the next one.
 */
export function fromWire(raw: unknown): PayerEntitlements {
  const w = (raw ?? {}) as Partial<Record<keyof EntitlementsWire, unknown>>;
  if (typeof w.version !== 'number' || !Number.isInteger(w.version) || w.version < 0) {
    throw new Error('entitlements: version is not a non-negative integer');
  }
  if (!w.features || typeof w.features !== 'object' || Array.isArray(w.features)) {
    throw new Error('entitlements: features is not an object');
  }
  const features: Record<string, FeatureGrant> = {};
  for (const [key, value] of Object.entries(w.features as Record<string, unknown>)) {
    features[key] = featureFromWire(key, value);
  }
  return {
    features,
    periodStart: dateFromWire('periodStart', w.periodStart),
    periodEnd: dateFromWire('periodEnd', w.periodEnd),
    validUntil: dateFromWire('validUntil', w.validUntil),
    version: w.version,
  };
}

function featureFromWire(key: string, raw: unknown): FeatureGrant {
  const f = (raw ?? {}) as Record<string, unknown>;
  if (typeof f['enabled'] !== 'boolean') throw new Error(`entitlements: ${key}.enabled is not a boolean`);
  const credits = f['monthlyCredits'];
  if (credits !== null && (typeof credits !== 'string' || !CREDITS.test(credits))) {
    throw new Error(`entitlements: ${key}.monthlyCredits is neither null nor a plain decimal`);
  }
  const limits = f['limits'] ?? {};
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits)) {
    throw new Error(`entitlements: ${key}.limits is not an object`);
  }
  return { enabled: f['enabled'], monthlyCredits: credits, limits: limits as Record<string, unknown> };
}

function dateFromWire(field: string, raw: unknown): Date {
  const date = typeof raw === 'string' ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error(`entitlements: ${field} is not an ISO date`);
  return date;
}
