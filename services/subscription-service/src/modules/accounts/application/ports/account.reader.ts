import type { BillingAccountType } from '../../domain/billing-account.js';
import type { AccountHistory, AccountOverview, LookupRows } from '../account-views.js';

export interface IAccountReader {
  overview(type: BillingAccountType, externalId: string, now: Date): Promise<AccountOverview | null>;
  history(type: BillingAccountType, externalId: string, now: Date): Promise<AccountHistory | null>;
  /**
   * Batch read for the admin panel's tables: the accounts among `externalIds` that exist (in no
   * particular order) and the audience's free plan. One round of queries whatever the batch size.
   */
  lookup(type: BillingAccountType, externalIds: string[], now: Date): Promise<LookupRows>;
}

export const ACCOUNT_READER = Symbol('ACCOUNT_READER');
