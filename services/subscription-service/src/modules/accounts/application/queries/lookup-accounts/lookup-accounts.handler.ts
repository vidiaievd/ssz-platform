import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { summariseLookup } from '../../account-summary.js';
import type { AccountLookupItem } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { LookupAccountsQuery } from './lookup-accounts.query.js';

@QueryHandler(LookupAccountsQuery)
export class LookupAccountsHandler implements IQueryHandler<LookupAccountsQuery, AccountLookupItem[]> {
  constructor(@Inject(ACCOUNT_READER) private readonly reader: IAccountReader) {}

  async execute(query: LookupAccountsQuery): Promise<AccountLookupItem[]> {
    const ids = [...new Set(query.externalIds)];
    const now = new Date();
    const rows = await this.reader.lookup(query.type, ids, now);
    return summariseLookup(ids, rows, now);
  }
}
