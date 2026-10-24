import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AiGateway } from '../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../ledger/domain/ai-call.js';
import { describeCall, type CallReport } from '../../application/describe-call.js';
import { AdminPayerResolver } from '../../application/admin-payer.resolver.js';
import { DIAGNOSTIC, DIAGNOSTIC_SCHEMA, DIAGNOSTIC_SYSTEM } from '../diagnostic.capability.js';
import { RunDiagnosticCommand } from './run-diagnostic.command.js';

export type DiagnosticResult = CallReport;

/**
 * Sends the admin's text through the gateway under the `diagnostic` binding and reports
 * the route it took. Like the model test, every outcome is an answer — including
 * "disabled" — so the endpoint is a 200 whatever happened.
 *
 * The platform pays, unless the admin names a payer to try that payer's policy and tariff.
 */
@CommandHandler(RunDiagnosticCommand)
export class RunDiagnosticHandler implements ICommandHandler<RunDiagnosticCommand, DiagnosticResult> {
  constructor(
    private readonly gateway: AiGateway,
    private readonly payers: AdminPayerResolver,
  ) {}

  async execute(command: RunDiagnosticCommand): Promise<DiagnosticResult> {
    const context: CallContext = {
      payer: await this.payers.resolve(command),
      actor: { userId: command.actorUserId, role: command.actorRole },
      surface: 'admin_diagnostic',
    };
    const call = await this.gateway.call(DIAGNOSTIC.code, context, {
      system: DIAGNOSTIC_SYSTEM,
      messages: [{ role: 'user', parts: [{ type: 'text', text: command.text }] }],
      responseSchema: { name: 'diagnostic_echo', schema: DIAGNOSTIC_SCHEMA },
    });
    return describeCall(DIAGNOSTIC.code, context, call);
  }
}
