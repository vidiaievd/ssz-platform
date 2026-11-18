import type { BillingAccountType } from '../../domain/billing-account.js';

/** Which subscriptions a version move looks at: one plan, versions below the target, still current. */
export interface MigrationScope {
  planId: string;
  toVersion: number;
  /** null = every version below `toVersion`. */
  fromVersions: readonly number[] | null;
  now: Date;
}

export interface ISubscriberMigrationReader {
  /** Current subscriptions in scope per source version; versions without any are left out. */
  countByVersion(scope: MigrationScope): Promise<{ version: number; subscribers: number }[]>;
  /** Up to `limit` accounts with a current subscription in scope, oldest subscription first. */
  accountsToMove(scope: MigrationScope, limit: number): Promise<{ type: BillingAccountType; externalId: string }[]>;
}

export const SUBSCRIBER_MIGRATION_READER = Symbol('SUBSCRIBER_MIGRATION_READER');
