import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { accountNotFound } from '../../account-lookup.js';
import type { AccountHistory } from '../../account-views.js';
import { ACCOUNT_READER, type IAccountReader } from '../../ports/account.reader.js';
import { GetAccountHistoryQuery } from './get-account-history.query.js';

@QueryHandler(GetAccountHistoryQuery)
export class GetAccountHistoryHandler implements IQueryHandler<GetAccountHistoryQuery, AccountHistory> {
  constructor(@Inject(ACCOUNT_READER) private readonly reader: IAccountReader) {}

  async execute(query: GetAccountHistoryQuery): Promise<AccountHistory> {
    const history = await this.reader.history(query.type, query.externalId, new Date());
    if (!history) throw accountNotFound(query.type, query.externalId);
    return history;
  }
}
