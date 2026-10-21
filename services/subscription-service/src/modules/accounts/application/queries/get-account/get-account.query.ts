import type { BillingAccountType } from '../../../domain/billing-account.js';

export class GetAccountQuery {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
  ) {}
}
