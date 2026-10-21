import type { BillingAccountType } from '../../../../accounts/domain/billing-account.js';

export class ResolveEntitlementsQuery {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
  ) {}
}
