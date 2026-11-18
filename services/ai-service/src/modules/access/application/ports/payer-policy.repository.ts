import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import type { Payer } from '../../domain/payer.js';
import type { PayerPolicy, StoredPayerPolicy } from '../../domain/payer-policy.js';
import type { BilledPayerType } from '../../domain/payer.js';

export interface IPayerPolicyRepository {
  /** Null when the payer has no stored policy. */
  get(payer: Payer): Promise<StoredPayerPolicy | null>;
  /** Stores the policy and writes its trail row (and event) in the same transaction. */
  save(payer: { type: BilledPayerType; id: string }, policy: PayerPolicy, audit: AdminAuditEntry): Promise<StoredPayerPolicy>;
}

export const PAYER_POLICY_REPOSITORY = Symbol('PAYER_POLICY_REPOSITORY');
