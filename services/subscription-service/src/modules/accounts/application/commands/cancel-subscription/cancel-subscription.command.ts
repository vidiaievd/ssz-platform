import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { BillingAccountType } from '../../../domain/billing-account.js';

export class CancelSubscriptionCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly actor: AdminActor,
    readonly reason: string,
    /** The account revision the caller read; a mismatch is 409 `account_changed`. Undefined = no check. */
    readonly expectedRevision?: number,
  ) {}
}
