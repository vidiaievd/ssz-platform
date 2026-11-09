import type { Result } from '../../../../shared/kernel/result.js';
import type { Grant } from '../../domain/grant.js';

export interface IGrantRepository {
  find(accountId: string, grantId: string): Promise<Grant | null>;
  /** Grants still to count — running or scheduled, not revoked. */
  listLive(accountId: string, now: Date): Promise<Grant[]>;
  insert(grant: Grant): Promise<void>;
  /** Stores a revocation unless someone revoked the grant first (`version_conflict`). */
  saveRevocation(grant: Grant): Promise<Result<void, 'version_conflict'>>;
}

export const GRANT_REPOSITORY = Symbol('GRANT_REPOSITORY');
