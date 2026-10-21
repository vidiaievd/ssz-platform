import type { BillingAccountType } from '../../../domain/billing-account.js';

export class AssignPlanCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly planCode: string,
    readonly status: 'trial' | 'active',
    readonly periodEnd: Date | null,
    readonly actorUserId: string,
  ) {}
}
