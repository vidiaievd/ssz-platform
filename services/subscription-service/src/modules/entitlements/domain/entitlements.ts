import type { BillingAccountType } from '../../accounts/domain/billing-account.js';
import { grantState, type GrantProps } from '../../accounts/domain/grant.js';
import type { SubscriptionStatus } from '../../accounts/domain/subscription.js';
import { featureKeyDefinition, SEATS_STUDENTS_KEY } from '../../plans/domain/feature-key.js';
import type { PlanAudience, PlanFeature } from '../../plans/domain/plan.js';
import { addCredits } from './credits.js';
import { creditPeriod } from './credit-period.js';

/**
 * The plan an account falls back to when it has no current subscription. Which plan is
 * "free" is a code decision, not a plan field: exactly one per audience, and it has to
 * exist before anyone can register.
 */
export const FREE_PLAN_CODES: Readonly<Record<PlanAudience, string>> = {
  workspace: 'free_workspace',
  individual: 'free_individual',
};

/** One key as the payer may use it now. */
export interface FeatureEntitlement {
  enabled: boolean;
  /** Decimal string per credit period; null = unmetered (or not metered in credits). */
  monthlyCredits: string | null;
  limits: Record<string, number>;
}

/** Where the plan part of the answer came from. */
export type EntitlementSource = 'subscription' | 'free_plan';

export interface Entitlements {
  account: { type: BillingAccountType; externalId: string };
  source: EntitlementSource;
  /** Null only when the free plan of the audience is missing (not seeded). */
  plan: { code: string; name: string; version: number } | null;
  subscription: { id: string; status: SubscriptionStatus; periodStart: Date; periodEnd: Date | null } | null;
  /** Keys the plan or a grant mentions. A key absent here is not sold to this payer. */
  features: Record<string, FeatureEntitlement>;
  /**
   * The grants switching a key on now, soonest to end first — so a screen can tell a key
   * given for a term apart from one the plan carries (mobile redesign 07, G1). Grants that
   * switch a key off are not listed: the key simply reads as off in `features`.
   */
  grants: { featureKey: string; endsAt: Date }[];
  /** The credit period monthly allowances are counted in. */
  periodStart: Date;
  periodEnd: Date;
  /**
   * The first moment time alone changes this answer: the credit period rolls over, a
   * scheduled grant starts, a grant or the subscription runs out. The refresh job bumps
   * the account's revision then, so a held snapshot never outlives it silently.
   */
  validUntil: Date;
  /**
   * The account's revision: grows with every assignment, cancellation and grant change, so a
   * consumer holding a snapshot can tell a newer one from a stale one. 0 = no account yet.
   */
  version: number;
}

/** A plan version as the resolver needs it. */
export interface ResolvablePlan {
  code: string;
  name: string;
  version: number;
  features: readonly PlanFeature[];
}

export interface EntitlementInputs {
  account: { type: BillingAccountType; externalId: string; revision: number };
  /** The account's current subscription with the plan version it points at; null = none. */
  subscription: {
    id: string;
    status: SubscriptionStatus;
    periodStart: Date;
    periodEnd: Date | null;
    plan: ResolvablePlan;
  } | null;
  /** The current version of the audience's free plan; null when it does not exist. */
  freePlan: ResolvablePlan | null;
  /**
   * Grants of the account; any state — the resolver keeps only the active ones, and looks
   * at scheduled ones for when they start.
   */
  grants: readonly Pick<GrantProps, 'featureKey' | 'enabled' | 'monthlyCredits' | 'limits' | 'startsAt' | 'endsAt' | 'revokedAt'>[];
  now: Date;
}

/**
 * Plan 78 §4: the current subscription's plan version, or the audience's free plan when
 * there is none; active grants on top.
 *
 * A grant always switches its key on. Its credits add to the plan's, where a plan key that
 * is off contributes nothing and one that is on but unmetered stays unmetered; a grant
 * without credits makes the key unmetered while it runs. Grant limits can only raise the
 * plan's — a grant is "on top", never a cut.
 *
 * A grant that switches its key off (plan 90, phase 3) wins over everything else: the plan
 * and any grant switching the same key on. It is applied last, whatever the order of rows.
 *
 * Seats (plan 90, phase 4): a grant raises the plan's `max`; on a plan that does not limit
 * seats it does nothing, since no limit is more than any `max`.
 */
export function resolveEntitlements(input: EntitlementInputs): Entitlements {
  const { subscription, now } = input;
  const plan = subscription?.plan ?? input.freePlan;

  const features: Record<string, FeatureEntitlement> = {};
  const active: { featureKey: string; endsAt: Date }[] = [];
  for (const f of plan?.features ?? []) {
    features[f.featureKey] = { enabled: f.enabled, monthlyCredits: f.monthlyCredits, limits: { ...f.limits } };
  }

  const switchedOff: string[] = [];
  for (const g of input.grants) {
    if (grantState(g, now) !== 'active') continue;
    if (!g.enabled) {
      switchedOff.push(g.featureKey);
      continue;
    }
    const base = features[g.featureKey];
    const baseOn = base?.enabled === true;
    // A head count the plan does not limit stays unlimited: a grant's `max` there would be a cut.
    if (!baseOn && featureKeyDefinition(g.featureKey)?.limitKind === 'seats') continue;
    active.push({ featureKey: g.featureKey, endsAt: g.endsAt });

    let credits: string | null;
    if (g.monthlyCredits === null) credits = null;
    else if (!baseOn) credits = g.monthlyCredits;
    else if (base!.monthlyCredits === null) credits = null;
    else credits = addCredits(base!.monthlyCredits, g.monthlyCredits);

    const limits: Record<string, number> = baseOn ? { ...base!.limits } : {};
    for (const [name, value] of Object.entries(g.limits)) {
      limits[name] = Math.max(limits[name] ?? 0, value);
    }

    features[g.featureKey] = { enabled: true, monthlyCredits: credits, limits };
  }
  for (const key of switchedOff) {
    features[key] = { enabled: false, monthlyCredits: null, limits: {} };
  }

  const period = subscription
    ? creditPeriod(subscription.periodStart, now, subscription.periodEnd)
    : creditPeriod(null, now);

  return {
    account: { type: input.account.type, externalId: input.account.externalId },
    source: subscription ? 'subscription' : 'free_plan',
    plan: plan ? { code: plan.code, name: plan.name, version: plan.version } : null,
    subscription: subscription
      ? { id: subscription.id, status: subscription.status, periodStart: subscription.periodStart, periodEnd: subscription.periodEnd }
      : null,
    features,
    grants: active.sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime()),
    periodStart: period.start,
    periodEnd: period.end,
    validUntil: nextChange(input, period.end),
    version: input.account.revision,
  };
}

/** The earliest future moment at which a term in the inputs starts or ends. */
function nextChange(input: EntitlementInputs, periodEnd: Date): Date {
  const { now } = input;
  let next = periodEnd;
  const consider = (at: Date | null): void => {
    if (at !== null && at > now && at < next) next = at;
  };
  consider(input.subscription?.periodEnd ?? null);
  for (const g of input.grants) {
    if (g.revokedAt !== null) continue;
    consider(g.startsAt);
    consider(g.endsAt);
  }
  return next;
}

/**
 * The student seat limit a payer has now (plan 90, phase 4): `limits.max` of `seats.students`
 * while the key is on; null = no limit (the plan does not mention the key — older versions,
 * individual plans — or a key without `max`, which validation does not let in).
 */
export function studentSeatLimit(features: Readonly<Record<string, FeatureEntitlement>>): number | null {
  const f = features[SEATS_STUDENTS_KEY];
  if (!f?.enabled) return null;
  const max = f.limits['max'];
  return typeof max === 'number' ? max : null;
}

/**
 * The seat limit from a plan's `seats.students` row and the payer's grants, by the same rules
 * as the full resolution (a grant only raises the plan's limit). For batch reads that do not
 * load whole plans.
 */
export function resolveStudentSeatLimit(
  planSeats: Pick<PlanFeature, 'enabled' | 'limits'> | null,
  grants: EntitlementInputs['grants'],
  now: Date,
): number | null {
  const resolved = resolveEntitlements({
    account: { type: 'workspace', externalId: '', revision: 0 },
    subscription: null,
    freePlan: {
      code: '',
      name: '',
      version: 0,
      features: planSeats ? [{ featureKey: SEATS_STUDENTS_KEY, monthlyCredits: null, ...planSeats }] : [],
    },
    grants: grants.filter((g) => g.featureKey === SEATS_STUDENTS_KEY),
    now,
  });
  return studentSeatLimit(resolved.features);
}
