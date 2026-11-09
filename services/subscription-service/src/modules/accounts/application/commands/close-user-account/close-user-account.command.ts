/** A learner's account was deleted for good (`auth.user.deleted`); their own payer account closes. */
export class CloseUserAccountCommand {
  readonly type = 'user' as const;

  constructor(readonly externalId: string) {}
}

/**
 * - `closed` — subscriptions closed and/or grants revoked;
 * - `nothing_open` — the account exists but had nothing running (a replay lands here);
 * - `no_account` — this payer was never seen.
 */
export type CloseUserAccountOutcome = 'closed' | 'nothing_open' | 'no_account';
