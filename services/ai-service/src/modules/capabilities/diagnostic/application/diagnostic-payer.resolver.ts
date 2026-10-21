import { Injectable } from '@nestjs/common';
import type { PayerResolver } from '../../../access/application/ports/payer-resolver.js';
import { PLATFORM_PAYER, type Payer } from '../../../access/domain/payer.js';
import type { RunDiagnosticCommand } from './run-diagnostic.command.js';

/**
 * The platform pays for an admin's check. A platform_admin may name a payer instead, to see
 * that payer's policy and tariff applied — the row is then that payer's, with
 * `surface: admin_diagnostic`. Only this admin-only endpoint lets a request name its payer.
 */
@Injectable()
export class DiagnosticPayerResolver implements PayerResolver<RunDiagnosticCommand> {
  async resolve(command: RunDiagnosticCommand): Promise<Payer> {
    return command.asPayer ?? PLATFORM_PAYER;
  }
}
