export interface CreditPeriod {
  start: Date;
  end: Date;
}

/** `anchor` moved by whole months, the day clamped to the target month (Jan 31 → Feb 28). */
function addMonths(anchor: Date, months: number): Date {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/**
 * The month that monthly credits are counted in right now.
 *
 * - No anchor (the free plan, which nobody started): the calendar month, UTC.
 * - A subscription: monthly cycles from the day it started, each one computed from the
 *   anchor itself so a cycle started on the 31st comes back to the 31st after February.
 *   The last cycle stops where the subscription does.
 *
 * Moving an account to another plan starts a fresh cycle — the new plan's allowance is
 * counted from the day it was given.
 */
export function creditPeriod(anchor: Date | null, now: Date, hardEnd: Date | null = null): CreditPeriod {
  if (anchor === null) {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    };
  }

  let k = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  if (k < 0) k = 0;
  if (k > 0 && addMonths(anchor, k) > now) k -= 1;

  const start = addMonths(anchor, k);
  const cycleEnd = addMonths(anchor, k + 1);
  const end = hardEnd !== null && hardEnd < cycleEnd ? hardEnd : cycleEnd;
  return { start, end };
}
