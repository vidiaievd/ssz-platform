import { Result } from '../../../shared/kernel/result.js';
import type { Plan, PlanAudience } from '../../plans/domain/plan.js';
import type { AccountError } from './account-errors.js';
import { closeSubscription, isCurrent, isOpen, type Subscription } from './subscription.js';

/** Who pays: a workspace (school, SOLO tutor included) or a self-taught learner. */
export type BillingAccountType = 'workspace' | 'user';

export const BILLING_ACCOUNT_TYPES: readonly BillingAccountType[] = ['workspace', 'user'];

/** The plan audience an account type buys from. */
export function audienceFor(type: BillingAccountType): PlanAudience {
  return type === 'workspace' ? 'workspace' : 'individual';
}

export interface BillingAccountProps {
  id: string;
  type: BillingAccountType;
  /** schoolId for `workspace`, userId for `user`. */
  externalId: string;
  createdAt: Date;
  /** Optimistic lock: bumped on every save; a stale one is a conflict. */
  revision: number;
  /** Rows still marked trial/active. Normally one; closed rows are history and not loaded. */
  openSubscriptions: Subscription[];
}

/**
 * A payer and its running subscription. Owns the rule that at most one subscription is open
 * at a time: assigning a plan closes whatever was open before opening the new row.
 */
export class BillingAccount {
  private readonly touched = new Map<string, Subscription>();

  private constructor(private props: BillingAccountProps) {}

  static restore(props: BillingAccountProps): BillingAccount {
    return new BillingAccount({ ...props, openSubscriptions: [...props.openSubscriptions] });
  }

  get id(): string {
    return this.props.id;
  }
  get type(): BillingAccountType {
    return this.props.type;
  }
  get externalId(): string {
    return this.props.externalId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get revision(): number {
    return this.props.revision;
  }

  current(now: Date): Subscription | null {
    return this.props.openSubscriptions.find((s) => isCurrent(s, now)) ?? null;
  }

  /**
   * Puts the account on the plan's current version. Assigning the plan it is already on is
   * how an admin moves it to the plan's latest version (plan 78 §2).
   */
  assignPlan(
    plan: Plan,
    input: { subscriptionId: string; status: 'trial' | 'active'; periodEnd: Date | null; by: string; now: Date },
  ): Result<Subscription, AccountError> {
    const audience = audienceFor(this.props.type);
    if (plan.audience !== audience) {
      return Result.fail({ code: 'audience_mismatch', planCode: plan.code, audience: plan.audience, accountType: this.props.type });
    }
    const version = plan.versionForAssignment();
    if (version.isFail) return Result.fail(version.error);
    if (input.status === 'trial' && input.periodEnd === null) return Result.fail({ code: 'trial_needs_period_end' });
    if (input.periodEnd !== null && input.periodEnd <= input.now) return Result.fail({ code: 'period_end_in_past' });

    this.closeOpen(input.by, input.now);
    const started: Subscription = {
      id: input.subscriptionId,
      accountId: this.props.id,
      planId: plan.id,
      planCode: plan.code,
      planVersion: version.value.version,
      status: input.status,
      periodStart: input.now,
      periodEnd: input.periodEnd,
      createdBy: input.by,
      createdAt: input.now,
      endedAt: null,
      endedBy: null,
    };
    this.props.openSubscriptions = [started];
    this.touched.set(started.id, started);
    return Result.ok(started);
  }

  /** Ends the current subscription; the account falls back to its audience's free plan (step 4). */
  cancelSubscription(by: string, now: Date): Result<Subscription, AccountError> {
    const current = this.current(now);
    if (!current) return Result.fail({ code: 'no_current_subscription' });
    this.closeOpen(by, now);
    return Result.ok(this.touched.get(current.id)!);
  }

  /** Subscription rows created or changed since load, for the repository to write. */
  changedSubscriptions(): Subscription[] {
    return [...this.touched.values()];
  }

  private closeOpen(by: string, now: Date): void {
    for (const s of this.props.openSubscriptions) {
      if (!isOpen(s)) continue;
      const closed = closeSubscription(s, by, now);
      this.touched.set(closed.id, closed);
    }
    this.props.openSubscriptions = [];
  }
}
