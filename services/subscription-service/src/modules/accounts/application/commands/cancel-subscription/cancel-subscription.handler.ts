import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { describeAccountError } from '../../../domain/account-errors.js';
import { accountNotFound } from '../../account-lookup.js';
import type { AccountOverview } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { CancelSubscriptionCommand } from './cancel-subscription.command.js';

/** Ends the current subscription now; the account falls back to its free plan. */
@CommandHandler(CancelSubscriptionCommand)
export class CancelSubscriptionHandler implements ICommandHandler<CancelSubscriptionCommand, AccountOverview> {
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(ACCOUNT_READER) private readonly reader: IAccountReader,
  ) {}

  async execute(command: CancelSubscriptionCommand): Promise<AccountOverview> {
    const account = await this.accounts.find(command.type, command.externalId);
    if (!account) throw accountNotFound(command.type, command.externalId);
    const now = new Date();

    const canceled = account.cancelSubscription(command.actorUserId, now);
    if (canceled.isFail) throw businessError(canceled.error, describeAccountError(canceled.error));

    const saved = await this.accounts.save(account);
    if (saved.isFail) throw new ConflictException('The account changed meanwhile; reload and retry');
    return (await this.reader.overview(command.type, command.externalId, now))!;
  }
}
