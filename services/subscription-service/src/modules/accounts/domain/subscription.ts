export type SubscriptionStatus = 'trial' | 'active' | 'canceled' | 'expired';

/** A plan version assigned to an account for a period. */
export interface Subscription {
  id: string;
  accountId: string;
  planId: string;
  planCode: string;
  planVersion: number;
  status: SubscriptionStatus;
  periodStart: Date;
  /** Null = open-ended; manual assignments without payment usually are. */
  periodEnd: Date | null;
  createdBy: string;
  createdAt: Date;
  endedAt: Date | null;
  endedBy: string | null;
}

/** Still marked as running — whether or not its period has run out yet. */
export function isOpen(s: Pick<Subscription, 'status'>): boolean {
  return s.status === 'trial' || s.status === 'active';
}

/**
 * What the account is entitled to through right now. A row whose period has passed stops
 * counting at once, before the daily job (step 5) gets round to marking it `expired`.
 */
export function isCurrent(s: Pick<Subscription, 'status' | 'periodEnd'>, now: Date): boolean {
  return isOpen(s) && (s.periodEnd === null || s.periodEnd > now);
}

/**
 * Takes an open row out of service. One whose period already ran out is `expired` as of its
 * end; one cut short is `canceled` now.
 */
export function closeSubscription(s: Subscription, by: string, now: Date): Subscription {
  const ranOut = s.periodEnd !== null && s.periodEnd <= now;
  return {
    ...s,
    status: ranOut ? 'expired' : 'canceled',
    endedAt: ranOut ? s.periodEnd : now,
    endedBy: by,
  };
}
