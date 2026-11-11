import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SYSTEM_ADMIN_ACTOR, adminAuditEntry } from '../../../../../shared/application/admin-audit.js';
import { accountTarget, subscriptionSnapshot } from '../../audit-snapshots.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import {
  CancelSchoolSubscriptionCommand,
  type CancelSchoolSubscriptionOutcome,
} from './cancel-school-subscription.command.js';

export const SCHOOL_CLOSED_REASON = 'school closed';

/**
 * Plan 90, phase 5, step 5. A closed school stops paying: the open subscription ends the same way
 * the admin's `DELETE` ends it, with the journal row written by `system`. Restoring the school does
 * not bring the plan back — an admin assigns it by hand. Grants are left alone.
 */
@CommandHandler(CancelSchoolSubscriptionCommand)
export class CancelSchoolSubscriptionHandler
  implements ICommandHandler<CancelSchoolSubscriptionCommand, CancelSchoolSubscriptionOutcome>
{
  constructor(@Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository) {}

  async execute(command: CancelSchoolSubscriptionCommand): Promise<CancelSchoolSubscriptionOutcome> {
    const account = await this.accounts.find(command.type, command.externalId);
    if (!account) return 'no_account';
    const now = new Date();

    const canceled = account.cancelSubscription(SYSTEM_ADMIN_ACTOR.userId, now);
    if (canceled.isFail) return 'nothing_open';

    const audit = adminAuditEntry({
      actor: SYSTEM_ADMIN_ACTOR,
      action: 'subscription.canceled',
      ...accountTarget(command.type, command.externalId),
      reason: SCHOOL_CLOSED_REASON,
      before: subscriptionSnapshot(canceled.value),
      now,
    });
    const saved = await this.accounts.save(account, audit);
    // Thrown, so the consumer redelivers and the retry loads the newer revision.
    if (saved.isFail) throw new ConflictException(`Account ${account.id} changed meanwhile`);
    return 'canceled';
  }
}
