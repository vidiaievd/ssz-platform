/**
 * Plan 78 §5, the "daily" job: accounts whose entitlements time has changed — a
 * subscription or grant ran out, a scheduled grant started, the credit period rolled
 * over — get lapsed subscriptions marked `expired` and their revision bumped, which is
 * what makes the snapshot publisher send a fresh `subscription.entitlements.changed`.
 */
export class RefreshDueAccountsCommand {
  constructor(readonly batchSize = 100) {}
}
