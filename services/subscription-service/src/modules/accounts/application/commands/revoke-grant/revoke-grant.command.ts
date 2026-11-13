import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { BillingAccountType } from '../../../domain/billing-account.js';

export class RevokeGrantCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly grantId: string,
    readonly actor: AdminActor,
    readonly reason: string,
  ) {}
}
