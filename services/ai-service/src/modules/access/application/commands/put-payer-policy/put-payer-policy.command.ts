import type { AdminActor } from '../../../../../shared/application/admin-audit.js';
import type { PayerPolicy } from '../../../domain/payer-policy.js';
import type { BilledPayerType } from '../../../domain/payer.js';

export class PutPayerPolicyCommand {
  constructor(
    readonly payerType: BilledPayerType,
    readonly payerId: string,
    readonly policy: PayerPolicy,
    readonly admin: AdminActor,
    readonly reason: string,
  ) {}
}
