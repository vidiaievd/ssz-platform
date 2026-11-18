import type { BilledPayerType } from '../../../domain/payer.js';

/** Every AI key of a payer with this period's spend, and its policy (plan 90, phase 3, step 4). */
export class GetPayerUsageQuery {
  constructor(
    readonly payerType: BilledPayerType,
    readonly payerId: string,
  ) {}
}
