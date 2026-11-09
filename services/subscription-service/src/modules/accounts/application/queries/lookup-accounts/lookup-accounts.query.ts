import type { BillingAccountType } from '../../../domain/billing-account.js';

export class LookupAccountsQuery {
  constructor(
    readonly type: BillingAccountType,
    /** 1–200 ids; duplicates are answered once. */
    readonly externalIds: readonly string[],
  ) {}
}
