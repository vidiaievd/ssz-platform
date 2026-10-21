import type { Payer } from '../../domain/payer.js';
import type { PayerPolicy, StoredPayerPolicy } from '../../domain/payer-policy.js';
import type { BilledPayerType } from '../../domain/payer.js';

export interface IPayerPolicyRepository {
  /** Null when the payer has no stored policy. */
  get(payer: Payer): Promise<StoredPayerPolicy | null>;
  save(payer: { type: BilledPayerType; id: string }, policy: PayerPolicy, updatedBy: string): Promise<StoredPayerPolicy>;
}

export const PAYER_POLICY_REPOSITORY = Symbol('PAYER_POLICY_REPOSITORY');
