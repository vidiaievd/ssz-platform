import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SYSTEM_ACTOR } from '../../../domain/billing-account.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { GRANT_REPOSITORY, type IGrantRepository } from '../../ports/grant.repository.js';
import { CloseUserAccountCommand, type CloseUserAccountOutcome } from './close-user-account.command.js';

/**
 * VoxOrd plan 07, step 3c. Money records are the one thing a deletion keeps: the account,
 * subscription and grant rows stay (they name no one but the userId), only nothing is left
 * running. Workspaces are not touched — a student-only account owns none.
 */
@CommandHandler(CloseUserAccountCommand)
export class CloseUserAccountHandler implements ICommandHandler<CloseUserAccountCommand, CloseUserAccountOutcome> {
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(GRANT_REPOSITORY) private readonly grants: IGrantRepository,
  ) {}

  async execute(command: CloseUserAccountCommand): Promise<CloseUserAccountOutcome> {
    const account = await this.accounts.find(command.type, command.externalId);
    if (!account) return 'no_account';
    const now = new Date();

    const closed = account.closeAll(SYSTEM_ACTOR, now);
    // The account first: its save checks the revision, and a grant revocation bumps it.
    if (closed.length > 0) {
      const saved = await this.accounts.save(account);
      // Thrown, so the consumer redelivers and the retry loads the newer revision.
      if (saved.isFail) throw new ConflictException(`Account ${account.id} changed meanwhile`);
    }

    const live = await this.grants.listLive(account.id, now);
    for (const grant of live) {
      if (grant.revoke(SYSTEM_ACTOR, now).isFail) continue;
      // A conflict = someone revoked it first; either way it no longer counts.
      await this.grants.saveRevocation(grant);
    }

    return closed.length > 0 || live.length > 0 ? 'closed' : 'nothing_open';
  }
}
