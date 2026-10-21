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

/** The subscription key an agent is sold under. */
export function featureKeyOf(capability: string): string {
  return `ai.${capability}`;
}
