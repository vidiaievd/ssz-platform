import type { BillingAccountType } from '../../domain/billing-account.js';
import type { AccountHistory, AccountOverview } from '../account-views.js';

export interface IAccountReader {
  overview(type: BillingAccountType, externalId: string, now: Date): Promise<AccountOverview | null>;
  history(type: BillingAccountType, externalId: string, now: Date): Promise<AccountHistory | null>;
}

export const ACCOUNT_READER = Symbol('ACCOUNT_READER');
