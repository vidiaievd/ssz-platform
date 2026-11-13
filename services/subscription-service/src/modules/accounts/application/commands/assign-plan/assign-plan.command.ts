import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { BillingAccountType } from '../../../domain/billing-account.js';

export class AssignPlanCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly planCode: string,
    readonly status: 'trial' | 'active',
    readonly periodEnd: Date | null,
    readonly actor: AdminActor,
    readonly reason: string,
  ) {}
}
