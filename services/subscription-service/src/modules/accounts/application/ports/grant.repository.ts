import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { Grant } from '../../domain/grant.js';

export interface IGrantRepository {
  find(accountId: string, grantId: string): Promise<Grant | null>;
  /** Grants still to count — running or scheduled, not revoked. */
  listLive(accountId: string, now: Date): Promise<Grant[]>;
  /** Grants are only ever issued by an admin, so the trail entry is not optional. */
  insert(grant: Grant, audit: AdminAuditEntry): Promise<void>;
  /**
   * Stores a revocation unless someone revoked the grant first (`version_conflict`). An admin's
   * revocation passes its trail entry; a payer's closure (system) passes none.
   */
  saveRevocation(grant: Grant, audit?: AdminAuditEntry): Promise<Result<void, 'version_conflict'>>;
}

export const GRANT_REPOSITORY = Symbol('GRANT_REPOSITORY');
