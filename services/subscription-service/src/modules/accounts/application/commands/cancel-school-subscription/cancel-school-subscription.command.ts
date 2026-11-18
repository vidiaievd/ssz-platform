/** A school was closed (`school.closed`): its workspace account loses the open subscription. */
export class CancelSchoolSubscriptionCommand {
  readonly type = 'workspace' as const;

  constructor(readonly externalId: string) {}
}

/**
 * - `canceled` — the subscription ended, the account is on the free plan;
 * - `nothing_open` — the account had no current subscription (a replay lands here);
 * - `no_account` — this school was never seen.
 */
export type CancelSchoolSubscriptionOutcome = 'canceled' | 'nothing_open' | 'no_account';
