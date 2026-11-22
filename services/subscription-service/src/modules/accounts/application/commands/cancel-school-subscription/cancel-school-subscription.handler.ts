import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SYSTEM_ADMIN_ACTOR, adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { accountTarget, grantSnapshot, subscriptionSnapshot } from '../../audit-snapshots.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { GRANT_REPOSITORY, type IGrantRepository } from '../../ports/grant.repository.js';
import {
  CancelSchoolSubscriptionCommand,
  type CancelSchoolSubscriptionOutcome,
} from './cancel-school-subscription.command.js';

export const SCHOOL_CLOSED_REASON = 'school closed';

/**
 * Plan 90, phase 5, step 5 and live check step 6. A closed school stops paying: the open
 * subscription ends the same way the admin's `DELETE` ends it, and every grant still to count
 * (running or scheduled) is revoked as the admin's revoke does it — each with its journal row
 * written by `system`, reason "school closed". Restoring the school brings back neither the plan
 * nor the grants — an admin assigns them by hand.
 */
@CommandHandler(CancelSchoolSubscriptionCommand)
export class CancelSchoolSubscriptionHandler
  implements ICommandHandler<CancelSchoolSubscriptionCommand, CancelSchoolSubscriptionOutcome>
{
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(GRANT_REPOSITORY) private readonly grants: IGrantRepository,
  ) {}

  async execute(command: CancelSchoolSubscriptionCommand): Promise<CancelSchoolSubscriptionOutcome> {
    const account = await this.accounts.find(command.type, command.externalId);
    if (!account) return 'no_account';
    const now = new Date();
    const target = accountTarget(command.type, command.externalId);

    // The account first: its save checks the revision, and a grant revocation bumps it.
    let subscription: 'canceled' | 'nothing_open' = 'nothing_open';
    const canceled = account.cancelSubscription(SYSTEM_ADMIN_ACTOR.userId, now);
    if (canceled.isOk) {
      const audit = adminAuditEntry({
        actor: SYSTEM_ADMIN_ACTOR,
        action: 'subscription.canceled',
        ...target,
        reason: SCHOOL_CLOSED_REASON,
        before: subscriptionSnapshot(canceled.value),
        now,
      });
      const saved = await this.accounts.save(account, audit);
      // Thrown, so the consumer redelivers and the retry loads the newer revision.
      if (saved.isFail) throw new ConflictException(`Account ${account.id} changed meanwhile`);
      subscription = 'canceled';
    }

    let grantsRevoked = 0;
    for (const grant of await this.grants.listLive(account.id, now)) {
      const before = grantSnapshot(grant);
      if (grant.revoke(SYSTEM_ADMIN_ACTOR.userId, now).isFail) continue;
      const audit = adminAuditEntry({
        actor: SYSTEM_ADMIN_ACTOR,
        action: 'grant.revoked',
        ...target,
        reason: SCHOOL_CLOSED_REASON,
        before,
        after: { grantId: grant.id, revokedAt: now.toISOString() },
        now,
      });
      // A conflict = an admin revoked it first; either way it no longer counts, and it has its own row.
      if ((await this.grants.saveRevocation(grant, audit)).isOk) grantsRevoked += 1;
    }

    return { subscription, grantsRevoked };
  }
}
