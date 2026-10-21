import { ConflictException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { businessError } from '../../../../../common/errors/business-error.js';
import { describeAccountError } from '../../../domain/account-errors.js';
import { accountNotFound } from '../../account-lookup.js';
import type { AccountOverview } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { BILLING_ACCOUNT_REPOSITORY, type IBillingAccountRepository } from '../../ports/billing-account.repository.js';
import { GRANT_REPOSITORY, type IGrantRepository } from '../../ports/grant.repository.js';
import { RevokeGrantCommand } from './revoke-grant.command.js';

@CommandHandler(RevokeGrantCommand)
export class RevokeGrantHandler implements ICommandHandler<RevokeGrantCommand, AccountOverview> {
  constructor(
    @Inject(BILLING_ACCOUNT_REPOSITORY) private readonly accounts: IBillingAccountRepository,
    @Inject(GRANT_REPOSITORY) private readonly grants: IGrantRepository,
    @Inject(ACCOUNT_READER) private readonly reader: IAccountReader,
  ) {}

  async execute(command: RevokeGrantCommand): Promise<AccountOverview> {
    const account = await this.accounts.find(command.type, command.externalId);
    if (!account) throw accountNotFound(command.type, command.externalId);
    const grant = await this.grants.find(account.id, command.grantId);
    if (!grant) throw new NotFoundException(`Grant ${command.grantId} not found on this account`);
    const now = new Date();

    const revoked = grant.revoke(command.actorUserId, now);
    if (revoked.isFail) throw businessError(revoked.error, describeAccountError(revoked.error));

    const saved = await this.grants.saveRevocation(grant);
    if (saved.isFail) throw new ConflictException(`Grant ${command.grantId} was revoked meanwhile`);
    return (await this.reader.overview(command.type, command.externalId, now))!;
  }
}
