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

/**
 * Agents sold under another agent's key and drawing on its credits (plan 84): a rehearsal is
 * one feature, `ai.practice`, whether a language model reads a text or a speech model hears a
 * reading — two agents only because a binding holds models of one modality. The explanation of
 * a rehearsed reading's sounds (plan 88, step 5b) is part of the same check; on hand-in it is part
 * of the pronunciation-level voice review (step 5c.2) — the same prompts under a second code, so
 * each pool stays a static entry here. A word's toneme heard in a pronunciation drill (step 8.3, Q15) spends
 * the same `ai.practice`. The phrase marks suggested to the prosody editor (plan 86, step 5c) are
 * the first agent of `ai.authoring`, a pool with no agent of its own name: authoring tools to come
 * (exercise generation) join it here.
 */
const SOLD_UNDER: Readonly<Record<string, string>> = {
  practice_voice: 'practice',
  pronunciation_explain: 'practice',
  voice_review_explain: 'voice_review_pronunciation',
  toneme_check: 'practice',
  prosody_markup: 'authoring',
};

/**
 * The agent whose key and credits this one uses — itself for every agent but those above. The
 * quota counter is kept per pool, so agents of one pool spend one allowance.
 */
export function quotaPoolOf(capability: string): string {
  return SOLD_UNDER[capability] ?? capability;
}

/** Every agent spending the pool's credits, the pool's own agent first — what the ledger sums. */
export function capabilitiesOfPool(pool: string): string[] {
  return [pool, ...Object.keys(SOLD_UNDER).filter((capability) => SOLD_UNDER[capability] === pool)];
}

/** The subscription key an agent is sold under. */
export function featureKeyOf(capability: string): string {
  return `ai.${quotaPoolOf(capability)}`;
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
