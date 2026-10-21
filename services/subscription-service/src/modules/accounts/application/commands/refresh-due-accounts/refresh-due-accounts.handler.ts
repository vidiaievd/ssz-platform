import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { RefreshDueAccountsCommand } from './refresh-due-accounts.command.js';

/** Returns how many accounts were refreshed. */
@CommandHandler(RefreshDueAccountsCommand)
export class RefreshDueAccountsHandler implements ICommandHandler<RefreshDueAccountsCommand, number> {
  constructor(@Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository) {}

  async execute(command: RefreshDueAccountsCommand): Promise<number> {
    const now = new Date();
    let refreshed = 0;
    for (const due of await this.accounts.dueForRefresh(now, command.batchSize)) {
      const account = await this.accounts.find(due.type, due.externalId);
      if (!account) continue;
      account.expireLapsed(now);
      // A conflict means an admin changed the account meanwhile; that bump does the job.
      if ((await this.accounts.save(account)).isOk) refreshed++;
    }
    return refreshed;
  }
}
