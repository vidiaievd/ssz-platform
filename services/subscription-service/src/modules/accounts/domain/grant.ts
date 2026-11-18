import { Result } from '../../../shared/kernel/result.js';
import { featureKeyDefinition } from '../../plans/domain/feature-key.js';
import { validatePlanFeatures, type PlanAudience } from '../../plans/domain/plan.js';
import type { AccountError } from './account-errors.js';

/**
 * - `scheduled` — starts later;
 * - `active` — counts towards entitlements now;
 * - `ended` — its term ran out;
 * - `revoked` — an admin withdrew it (whatever its term said).
 */
export type GrantState = 'scheduled' | 'active' | 'ended' | 'revoked';

export interface GrantProps {
  id: string;
  accountId: string;
  featureKey: string;
  /**
   * true — switches the key on for the term, even where the plan has it off; false — switches
   * it off for the term, even where the plan or another grant has it on (plan 90, phase 3).
   */
  enabled: boolean;
  /**
   * Credits per month on top of the plan's for this key; null = unmetered while the grant
   * runs. Always null on a grant that switches the key off.
   */
  monthlyCredits: string | null;
  limits: Record<string, number>;
  startsAt: Date;
  endsAt: Date;
  /** Why it was given — a pilot, a complaint, a discount; required, it is the audit trail. */
  reason: string;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

/**
 * A manual change on top of the plan for a term, with an author: a key or credit allowance,
 * or a key switched off.
 */
export class Grant {
  private constructor(private props: GrantProps) {}

  static issue(input: {
    id: string;
    accountId: string;
    featureKey: string;
    /** Omitted = true (switches the key on). */
    enabled?: boolean;
    /** The audience of the account it is given to; keys meant for the other one are refused. */
    audience?: PlanAudience;
    monthlyCredits: string | null;
    limits: Record<string, number>;
    startsAt: Date;
    endsAt: Date;
    reason: string;
    by: string;
    now: Date;
  }): Result<Grant, AccountError> {
    // Same key catalogue and credit/limit rules as a plan feature.
    const enabled = input.enabled ?? true;
    // A switching-off grant carries no limits, so the required ones are not asked of it.
    const checked = validatePlanFeatures(
      [{ featureKey: input.featureKey, enabled, monthlyCredits: input.monthlyCredits, limits: input.limits }],
      { audience: input.audience },
    );
    if (checked.isFail) return Result.fail(checked.error);
    // Seats cannot be switched off: the roster a school already has would read as "no seats".
    if (!enabled && featureKeyDefinition(input.featureKey)?.limitKind === 'seats') {
      return Result.fail({ code: 'grant_disable_not_applicable', featureKey: input.featureKey });
    }
    // Switching a key off gives nothing: credits or limits on it would read as an allowance.
    if (!enabled && (input.monthlyCredits !== null || Object.keys(input.limits).length > 0)) {
      return Result.fail({ code: 'grant_disable_with_allowance', featureKey: input.featureKey });
    }
    const reason = input.reason.trim();
    if (!reason) return Result.fail({ code: 'grant_reason_required' });
    if (input.endsAt <= input.startsAt || input.endsAt <= input.now) return Result.fail({ code: 'invalid_grant_period' });

    const feature = checked.value[0]!;
    return Result.ok(
      new Grant({
        id: input.id,
        accountId: input.accountId,
        featureKey: feature.featureKey,
        enabled,
        monthlyCredits: feature.monthlyCredits,
        limits: feature.limits,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason,
        createdBy: input.by,
        createdAt: input.now,
        revokedAt: null,
        revokedBy: null,
      }),
    );
  }

  static restore(props: GrantProps): Grant {
    return new Grant(props);
  }

  get id(): string {
    return this.props.id;
  }
  get snapshot(): Readonly<GrantProps> {
    return this.props;
  }

  stateAt(now: Date): GrantState {
    return grantState(this.props, now);
  }

  revoke(by: string, now: Date): Result<void, AccountError> {
    const state = this.stateAt(now);
    if (state === 'revoked') return Result.fail({ code: 'grant_already_revoked', grantId: this.id });
    if (state === 'ended') return Result.fail({ code: 'grant_ended', grantId: this.id });
    this.props = { ...this.props, revokedAt: now, revokedBy: by };
    return Result.ok();
  }
}

export function grantState(g: Pick<GrantProps, 'startsAt' | 'endsAt' | 'revokedAt'>, now: Date): GrantState {
  if (g.revokedAt !== null) return 'revoked';
  if (g.endsAt <= now) return 'ended';
  if (g.startsAt > now) return 'scheduled';
  return 'active';
}
