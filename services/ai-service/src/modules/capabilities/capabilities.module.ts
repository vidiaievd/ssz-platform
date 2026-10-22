import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module.js';
import { AdminPayerResolver } from './application/admin-payer.resolver.js';
import { RunDiagnosticHandler } from './diagnostic/application/run-diagnostic.handler.js';
import { AdminDiagnosticController } from './diagnostic/presentation/admin-diagnostic.controller.js';
import { TryTranslateReviewHandler } from './review-draft/application/try-translate-review.handler.js';
import { AdminReviewDraftController } from './review-draft/presentation/admin-review-draft.controller.js';

/** Agents: `diagnostic` (plan 77) and `review_draft` (plan 79); each agent plan adds its own folder here. */
@Module({
  imports: [GatewayModule],
  controllers: [AdminDiagnosticController, AdminReviewDraftController],
  providers: [RunDiagnosticHandler, TryTranslateReviewHandler, AdminPayerResolver],
})
export class CapabilitiesModule {}
