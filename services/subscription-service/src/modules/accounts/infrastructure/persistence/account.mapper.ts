import type {
  Grant as PrismaGrant,
  Subscription as PrismaSubscription,
} from '../../../../../generated/prisma/client.js';
import type { GrantView, SubscriptionView } from '../../application/account-views.js';
import { Grant, grantState, type GrantProps } from '../../domain/grant.js';
import type { Subscription } from '../../domain/subscription.js';

type SubscriptionRow = PrismaSubscription & { plan: { code: string; name: string } };

export const withPlan = { plan: { select: { code: true, name: true } } } as const;

export function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    accountId: row.accountId,
    planId: row.planId,
    planCode: row.plan.code,
    planVersion: row.planVersion,
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    endedBy: row.endedBy,
  };
}

export function toSubscriptionView(row: SubscriptionRow): SubscriptionView {
  const { id, planCode, planVersion, status, periodStart, periodEnd, createdBy, createdAt, endedAt, endedBy } = toSubscription(row);
  return { id, planCode, planName: row.plan.name, planVersion, status, periodStart, periodEnd, createdBy, createdAt, endedAt, endedBy };
}

export function toGrantProps(row: PrismaGrant): GrantProps {
  return {
    id: row.id,
    accountId: row.accountId,
    featureKey: row.featureKey,
    monthlyCredits: row.monthlyCredits?.toString() ?? null,
    limits: (row.limits ?? {}) as Record<string, number>,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    revokedBy: row.revokedBy,
  };
}

export function toGrant(row: PrismaGrant): Grant {
  return Grant.restore(toGrantProps(row));
}

export function toGrantView(row: PrismaGrant, now: Date): GrantView {
  const { accountId: _accountId, ...props } = toGrantProps(row);
  return { ...props, state: grantState(props, now) };
}
