import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { Grant } from '../../domain/grant.js';

export interface IGrantRepository {
  find(accountId: string, grantId: string): Promise<Grant | null>;
  /** Grants still to count — running or scheduled, not revoked. */
  listLive(accountId: string, now: Date): Promise<Grant[]>;
  /**
   * Grants are only ever issued by an admin, so the trail entry is not optional. With
   * `claimRevision` the account's revision is bumped only from that value, else nothing is
   * written (`account_changed`); without it the bump is unconditional.
   */
  insert(grant: Grant, audit: AdminAuditEntry, claimRevision?: number): Promise<Result<void, 'account_changed'>>;
  /**
   * Stores a revocation unless someone revoked the grant first (`version_conflict`). An admin's
   * revocation passes its trail entry; a payer's closure (system) passes none. `claimRevision`
   * as in `insert`.
   */
  saveRevocation(
    grant: Grant,
    audit?: AdminAuditEntry,
    claimRevision?: number,
  ): Promise<Result<void, 'version_conflict' | 'account_changed'>>;
}

export const GRANT_REPOSITORY = Symbol('GRANT_REPOSITORY');
