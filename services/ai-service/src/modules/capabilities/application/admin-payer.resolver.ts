import { Injectable } from '@nestjs/common';
import type { PayerResolver } from '../../access/application/ports/payer-resolver.js';
import { PLATFORM_PAYER, type Payer } from '../../access/domain/payer.js';
import type { BilledPayerType } from '../../access/domain/payer.js';

/** An admin run of a capability; `asPayer` is set only by a platform_admin endpoint. */
export interface AdminRun {
  asPayer: { type: BilledPayerType; id: string } | null;
}

/**
 * The platform pays for an admin's check. A platform_admin may name a payer instead, to see
 * that payer's policy and tariff applied — the row is then that payer's, with the admin
 * surface. Only admin-only endpoints (`diagnostic`, the review try-out) let a request name
 * its payer.
 */
@Injectable()
export class AdminPayerResolver implements PayerResolver<AdminRun> {
  async resolve(run: AdminRun): Promise<Payer> {
    return run.asPayer ?? PLATFORM_PAYER;
  }
}
