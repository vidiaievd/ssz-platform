import type { BillingAccountType } from '../../../domain/billing-account.js';

export class RevokeGrantCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly grantId: string,
    readonly actorUserId: string,
  ) {}
}
