import type { BilledPayerType } from '../../../access/domain/payer.js';

export class RunDiagnosticCommand {
  constructor(
    readonly text: string,
    readonly actorUserId: string,
    readonly actorRole: string | null,
    /** Run as this payer to see its policy and tariff applied; omitted = the platform pays. */
    readonly asPayer: { type: BilledPayerType; id: string } | null = null,
  ) {}
}
