import type { BilledPayerType } from '../../../domain/payer.js';

export class GetPayerPolicyQuery {
  constructor(
    readonly payerType: BilledPayerType,
    readonly payerId: string,
  ) {}
}
