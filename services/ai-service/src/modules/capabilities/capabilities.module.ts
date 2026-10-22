import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { AdminPayerResolver } from './application/admin-payer.resolver.js';
import { RunDiagnosticHandler } from './diagnostic/application/run-diagnostic.handler.js';
import { AdminDiagnosticController } from './diagnostic/presentation/admin-diagnostic.controller.js';
import { DraftReviewHandler } from './review-draft/application/draft-review/draft-review.handler.js';
import { REVIEW_ATTEMPTS_CLIENT } from './review-draft/application/ports/review-attempts.client.js';
import { SCHOOL_LANGUAGE_READER } from './review-draft/application/ports/school-language.reader.js';
import { SchoolPayerResolver } from './review-draft/application/school-payer.resolver.js';
import { TryTranslateReviewHandler } from './review-draft/application/try-translate-review.handler.js';
import { HttpReviewAttemptsClient } from './review-draft/infrastructure/http-review-attempts.client.js';
import { HttpSchoolLanguageReader } from './review-draft/infrastructure/http-school-language.reader.js';
import { AdminReviewDraftController } from './review-draft/presentation/admin-review-draft.controller.js';
import { RoutedForReviewConsumer } from './review-draft/presentation/events/routed-for-review.consumer.js';

/** Agents: `diagnostic` (plan 77) and `review_draft` (plan 79); each agent plan adds its own folder here. */
@Module({
  imports: [GatewayModule],
  controllers: [AdminDiagnosticController, AdminReviewDraftController],
  providers: [
    RunDiagnosticHandler,
    TryTranslateReviewHandler,
    AdminPayerResolver,
    // review_draft into the teacher's queue (plan 79, step 1.3)
    DraftReviewHandler,
    SchoolPayerResolver,
    RoutedForReviewConsumer,
    {
      provide: REVIEW_ATTEMPTS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpReviewAttemptsClient(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: SCHOOL_LANGUAGE_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpSchoolLanguageReader(config.get<string>('organizationServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
  ],
})
export class CapabilitiesModule {}
