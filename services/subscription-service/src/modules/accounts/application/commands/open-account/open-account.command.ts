import type { BillingAccountType } from '../../../domain/billing-account.js';

/** A payer came into being elsewhere (a school created, a learner registered). */
export class OpenAccountCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
  ) {}
}

/**
 * - `opened` — the account is on its audience's free plan now;
 * - `exists` — it had a history already and was left alone;
 * - `no_free_plan` — the free plan is missing or archived; the account stays without a
 *   subscription, which resolves to the free plan's absence (no keys).
 */
export type OpenAccountOutcome = 'opened' | 'exists' | 'no_free_plan';
