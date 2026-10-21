import type { Result } from '../../../../shared/kernel/result.js';
import type { Grant } from '../../domain/grant.js';

export interface IGrantRepository {
  find(accountId: string, grantId: string): Promise<Grant | null>;
  insert(grant: Grant): Promise<void>;
  /** Stores a revocation unless someone revoked the grant first (`version_conflict`). */
  saveRevocation(grant: Grant): Promise<Result<void, 'version_conflict'>>;
}

export const GRANT_REPOSITORY = Symbol('GRANT_REPOSITORY');
