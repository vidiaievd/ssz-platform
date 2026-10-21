import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { accountNotFound } from '../../account-lookup.js';
import type { AccountOverview } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { GetAccountQuery } from './get-account.query.js';

@QueryHandler(GetAccountQuery)
export class GetAccountHandler implements IQueryHandler<GetAccountQuery, AccountOverview> {
  constructor(@Inject(ACCOUNT_READER) private readonly reader: IAccountReader) {}

  async execute(query: GetAccountQuery): Promise<AccountOverview> {
    const overview = await this.reader.overview(query.type, query.externalId, new Date());
    if (!overview) throw accountNotFound(query.type, query.externalId);
    return overview;
  }
}
