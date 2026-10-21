import { randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { describeAccountError } from '../../../domain/account-errors.js';
import { Grant } from '../../../domain/grant.js';
import type { AccountOverview } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { GRANT_REPOSITORY, type IGrantRepository } from '../../ports/grant.repository.js';
import { IssueGrantCommand } from './issue-grant.command.js';

@CommandHandler(IssueGrantCommand)
export class IssueGrantHandler implements ICommandHandler<IssueGrantCommand, AccountOverview> {
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(GRANT_REPOSITORY) private readonly grants: IGrantRepository,
    @Inject(ACCOUNT_READER) private readonly reader: IAccountReader,
  ) {}

  async execute(command: IssueGrantCommand): Promise<AccountOverview> {
    const account = await this.accounts.ensure(command.type, command.externalId);
    const now = new Date();
    const { grant: g } = command;

    const issued = Grant.issue({
      id: randomUUID(),
      accountId: account.id,
      featureKey: g.featureKey,
      monthlyCredits: g.monthlyCredits,
      limits: g.limits,
      startsAt: g.startsAt ?? now,
      endsAt: g.endsAt,
      reason: g.reason,
      by: command.actorUserId,
      now,
    });
    if (issued.isFail) throw businessError(issued.error, describeAccountError(issued.error));

    await this.grants.insert(issued.value);
    return (await this.reader.overview(command.type, command.externalId, now))!;
  }
}
