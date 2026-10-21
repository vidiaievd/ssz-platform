import type { BillingAccountType } from '../../../domain/billing-account.js';

export class IssueGrantCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly grant: {
      featureKey: string;
      monthlyCredits: string | null;
      limits: Record<string, number>;
      /** Undefined = now. */
      startsAt: Date | undefined;
      endsAt: Date;
      reason: string;
    },
    readonly actorUserId: string,
  ) {}
}
