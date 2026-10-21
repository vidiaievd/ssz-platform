import type { BillingAccountType } from '../../../domain/billing-account.js';

export class GetAccountHistoryQuery {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
  ) {}
}
