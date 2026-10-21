import { Result } from '../../../shared/kernel/result.js';
import { featureKeyDefinition, type FeatureKeyDefinition } from './feature-key.js';
import type { PlanError } from './plan-errors.js';

/** Who a plan is sold to: a workspace (school, SOLO tutor included) or one learner. */
export type PlanAudience = 'workspace' | 'individual';

export type PlanStatus = 'active' | 'archived';

/** One key as a plan version grants it. */
export interface PlanFeature {
  featureKey: string;
  enabled: boolean;
  /** Decimal string; null = unmetered (or not metered in credits at all). */
  monthlyCredits: string | null;
  /** Key-specific numeric limits, e.g. `perLearnerMonthlyCredits`. */
  limits: Record<string, number>;
}

/**
 * An immutable snapshot of what a plan grants. A subscription points at a version, so
 * revising a plan never silently changes what existing subscribers are entitled to.
 */
export interface PlanVersion {
  version: number;
  features: PlanFeature[];
  createdBy: string;
  createdAt: Date;
}

export interface PlanProps {
  id: string;
  code: string;
  name: string;
  audience: PlanAudience;
  status: PlanStatus;
  current: PlanVersion;
}

const PLAN_CODE = /^[a-z][a-z0-9_]{1,63}$/;
/** Fits the DECIMAL(18, 6) the credits are stored in. */
const CREDITS = /^\d{1,12}(\.\d{1,6})?$/;

export type FeatureKeyLookup = (key: string) => FeatureKeyDefinition | undefined;

/**
 * Checks a plan's feature list against the key catalogue: every key known and listed once,
 * credits only on metered keys, limits only the ones the key understands.
 */
export function validatePlanFeatures(
  features: readonly PlanFeature[],
  lookup: FeatureKeyLookup = featureKeyDefinition,
): Result<PlanFeature[], PlanError> {
  const seen = new Set<string>();
  const out: PlanFeature[] = [];
  for (const f of features) {
    const def = lookup(f.featureKey);
    if (!def) return Result.fail({ code: 'unknown_feature_key', featureKey: f.featureKey });
    if (seen.has(f.featureKey)) return Result.fail({ code: 'duplicate_feature_key', featureKey: f.featureKey });
    seen.add(f.featureKey);

    if (f.monthlyCredits !== null) {
      if (def.limitKind !== 'ai_credits') {
        return Result.fail({ code: 'credits_not_applicable', featureKey: f.featureKey });
      }
      if (!CREDITS.test(f.monthlyCredits)) {
        return Result.fail({ code: 'invalid_credits', featureKey: f.featureKey, value: f.monthlyCredits });
      }
    }

    for (const [name, value] of Object.entries(f.limits)) {
      if (!def.limitNames.includes(name)) {
        return Result.fail({ code: 'unknown_limit', featureKey: f.featureKey, limit: name });
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return Result.fail({ code: 'invalid_limit', featureKey: f.featureKey, limit: name });
      }
    }

    out.push({ featureKey: f.featureKey, enabled: f.enabled, monthlyCredits: f.monthlyCredits, limits: { ...f.limits } });
  }
  return Result.ok(out);
}

/**
 * A tariff: a code, an audience and a history of versions, of which only the latest is
 * offered. Archiving stops new assignments; existing subscriptions keep their version.
 */
export class Plan {
  private constructor(private props: PlanProps) {}

  static create(input: {
    id: string;
    code: string;
    name: string;
    audience: PlanAudience;
    features: readonly PlanFeature[];
    createdBy: string;
    now: Date;
  }): Result<Plan, PlanError> {
    if (!PLAN_CODE.test(input.code)) return Result.fail({ code: 'invalid_plan_code', value: input.code });
    const features = validatePlanFeatures(input.features);
    if (features.isFail) return Result.fail(features.error);
    return Result.ok(
      new Plan({
        id: input.id,
        code: input.code,
        name: input.name,
        audience: input.audience,
        status: 'active',
        current: { version: 1, features: features.value, createdBy: input.createdBy, createdAt: input.now },
      }),
    );
  }

  static restore(props: PlanProps): Plan {
    return new Plan(props);
  }

  get id(): string {
    return this.props.id;
  }
  get code(): string {
    return this.props.code;
  }
  get name(): string {
    return this.props.name;
  }
  get audience(): PlanAudience {
    return this.props.audience;
  }
  get status(): PlanStatus {
    return this.props.status;
  }
  get current(): PlanVersion {
    return this.props.current;
  }

  /** A display-name change: descriptive only, so no new version. */
  rename(name: string): void {
    this.props = { ...this.props, name };
  }

  /**
   * New features = new version. Subscribers stay on the version they were assigned until an
   * admin moves them (plan 78 §2), so a price or credit change never reaches them unasked.
   */
  revise(features: readonly PlanFeature[], by: string, now: Date): Result<PlanVersion, PlanError> {
    if (this.props.status === 'archived') return Result.fail({ code: 'plan_archived', planCode: this.code });
    const checked = validatePlanFeatures(features);
    if (checked.isFail) return Result.fail(checked.error);
    const next: PlanVersion = {
      version: this.props.current.version + 1,
      features: checked.value,
      createdBy: by,
      createdAt: now,
    };
    this.props = { ...this.props, current: next };
    return Result.ok(next);
  }

  archive(): Result<void, PlanError> {
    if (this.props.status === 'archived') return Result.fail({ code: 'plan_already_archived', planCode: this.code });
    this.props = { ...this.props, status: 'archived' };
    return Result.ok();
  }

  /** The version a new subscription would be put on; an archived plan offers none. */
  versionForAssignment(): Result<PlanVersion, PlanError> {
    if (this.props.status === 'archived') return Result.fail({ code: 'plan_archived', planCode: this.code });
    return Result.ok(this.props.current);
  }
}
