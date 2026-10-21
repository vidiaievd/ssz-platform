import type { BillingAccountType } from '../../../domain/billing-account.js';

export class CancelSubscriptionCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly actorUserId: string,
  ) {}
}
