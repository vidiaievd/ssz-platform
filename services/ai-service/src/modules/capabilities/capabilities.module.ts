import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module.js';
import { RunDiagnosticHandler } from './diagnostic/application/run-diagnostic.handler.js';
import { AdminDiagnosticController } from './diagnostic/presentation/admin-diagnostic.controller.js';

/** Agents. In plan 77 only `diagnostic`; each agent plan (79–82) adds its own folder here. */
@Module({
  imports: [GatewayModule],
  controllers: [AdminDiagnosticController],
  providers: [RunDiagnosticHandler],
})
export class CapabilitiesModule {}
