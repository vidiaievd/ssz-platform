import type { BillingAccountType } from '../domain/billing-account.js';
import type { GrantState } from '../domain/grant.js';
import type { SubscriptionStatus } from '../domain/subscription.js';

export interface AccountView {
  id: string;
  type: BillingAccountType;
  externalId: string;
  createdAt: Date;
}

export interface SubscriptionView {
  id: string;
  planCode: string;
  planName: string;
  planVersion: number;
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date | null;
  createdBy: string;
  createdAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

export interface GrantView {
  id: string;
  featureKey: string;
  monthlyCredits: string | null;
  limits: Record<string, number>;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  state: GrantState;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

/** What the account runs on now: the current subscription (null = free plan) and live grants. */
export interface AccountOverview {
  account: AccountView;
  subscription: SubscriptionView | null;
  /** Active and scheduled grants, soonest ending first. */
  grants: GrantView[];
}

/** Everything ever assigned or granted, newest first. */
export interface AccountHistory {
  account: AccountView;
  subscriptions: SubscriptionView[];
  grants: GrantView[];
}
