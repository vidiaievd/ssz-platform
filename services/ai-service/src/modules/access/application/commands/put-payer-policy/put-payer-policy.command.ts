import type { PayerPolicy } from '../../../domain/payer-policy.js';
import type { BilledPayerType } from '../../../domain/payer.js';

export class PutPayerPolicyCommand {
  constructor(
    readonly payerType: BilledPayerType,
    readonly payerId: string,
    readonly policy: PayerPolicy,
    readonly updatedBy: string,
  ) {}
}
