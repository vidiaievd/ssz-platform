import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { BillingAccountType } from '../../../domain/billing-account.js';

export class IssueGrantCommand {
  constructor(
    readonly type: BillingAccountType,
    readonly externalId: string,
    readonly grant: {
      featureKey: string;
      /** false = switch the key off for the term. */
      enabled: boolean;
      monthlyCredits: string | null;
      limits: Record<string, number>;
      /** Undefined = now. */
      startsAt: Date | undefined;
      endsAt: Date;
      /** The grant's own reason, and the trail's. */
      reason: string;
    },
    readonly actor: AdminActor,
  ) {}
}
