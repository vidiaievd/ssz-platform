/**
 * A school was closed (`school.closed`): its workspace account loses the open subscription and
 * every grant still to count (running or scheduled).
 */
export class CancelSchoolSubscriptionCommand {
  readonly type = 'workspace' as const;

  constructor(readonly externalId: string) {}
}

/**
 * - `no_account` — this school was never seen;
 * - otherwise what happened to the subscription (`canceled`, or `nothing_open` when there was
 *   none — a replay, or a school on the free plan) and how many grants were revoked.
 */
export type CancelSchoolSubscriptionOutcome =
  | 'no_account'
  | { subscription: 'canceled' | 'nothing_open'; grantsRevoked: number };
