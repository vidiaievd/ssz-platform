/**
 * What the payer's tariff gives one agent — the shape plan 78 resolves per feature key
 * (`ai.<capability>`): switched on, a monthly credit allowance, and the period it counts in.
 */
export interface FeatureEntitlement {
  enabled: boolean;
  /** Decimal string; null = no quota. */
  monthlyCredits: string | null;
  /** Feature-specific limits from the tariff (per-learner caps etc.); unread until an agent needs them. */
  limits: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
}

/** One feature as subscription-service resolves it, without the period every feature shares. */
export type FeatureGrant = Pick<FeatureEntitlement, 'enabled' | 'monthlyCredits' | 'limits'>;

/**
 * A payer's whole entitlements as subscription-service last announced them (plan 78 §6):
 * every feature key of the tariff with grants applied, the credit period, and when time
 * alone makes the snapshot wrong.
 */
export interface PayerEntitlements {
  /** A key absent here is not available to the payer. */
  features: Record<string, FeatureGrant>;
  periodStart: Date;
  periodEnd: Date;
  /** Past this moment the snapshot is stale: a period rolled over or a grant/subscription ran out. */
  validUntil: Date;
  /** The payer's account revision; a higher one always wins. */
  version: number;
}

/** The subscription key an agent is sold under. */
export function featureKeyOf(capability: string): string {
  return `ai.${capability}`;
}

export function isStale(snapshot: PayerEntitlements, now: Date): boolean {
  return snapshot.validUntil.getTime() <= now.getTime();
}

/** Null when the payer's tariff does not mention the feature. */
export function featureOf(snapshot: PayerEntitlements, featureKey: string): FeatureEntitlement | null {
  const feature = snapshot.features[featureKey];
  if (!feature) return null;
  return { ...feature, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd };
}

/**
 * Whether `incoming` should replace `stored`. Snapshots arrive out of order and twice: the
 * higher version wins. At one version, the later `validUntil` wins — time changes what a
 * revision resolves to before subscription-service bumps it, so a fresh read of the same
 * revision must replace the stale one, and the stale event that follows must not undo it.
 */
export function supersedes(incoming: PayerEntitlements, stored: PayerEntitlements): boolean {
  if (incoming.version !== stored.version) return incoming.version > stored.version;
  return incoming.validUntil.getTime() >= stored.validUntil.getTime();
}
