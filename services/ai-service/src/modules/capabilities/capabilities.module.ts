import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { AdminPayerResolver } from './application/admin-payer.resolver.js';
import { RunDiagnosticHandler } from './diagnostic/application/run-diagnostic.handler.js';
import { AdminDiagnosticController } from './diagnostic/presentation/admin-diagnostic.controller.js';
import { DirectReviewHandler } from './review-direct/application/direct-review/direct-review.handler.js';
import { LearnerPayerResolver } from './review-direct/application/learner-payer.resolver.js';
import { DIRECT_REVIEW_ATTEMPTS_CLIENT } from './review-direct/application/ports/direct-review-attempts.client.js';
import { LEARNER_LANGUAGE_READER } from './review-direct/application/ports/learner-language.reader.js';
import { HttpDirectReviewAttemptsClient } from './review-direct/infrastructure/http-direct-review-attempts.client.js';
import { HttpLearnerLanguageReader } from './review-direct/infrastructure/http-learner-language.reader.js';
import { DraftReviewHandler } from './review-draft/application/draft-review/draft-review.handler.js';
import { REVIEW_ATTEMPTS_CLIENT } from './review-draft/application/ports/review-attempts.client.js';
import { SCHOOL_LANGUAGE_READER } from './review-draft/application/ports/school-language.reader.js';
import { SchoolPayerResolver } from './review-draft/application/school-payer.resolver.js';
import { TryTranslateReviewHandler } from './review-draft/application/try-translate-review.handler.js';
import { HttpReviewAttemptsClient } from './review-draft/infrastructure/http-review-attempts.client.js';
import { HttpSchoolLanguageReader } from './review-draft/infrastructure/http-school-language.reader.js';
import { AdminReviewDraftController } from './review-draft/presentation/admin-review-draft.controller.js';
import { RoutedForReviewConsumer } from './review-draft/presentation/events/routed-for-review.consumer.js';
import { EVAL_RUN_REPOSITORY } from './review-draft/eval/application/ports/eval-run.repository.js';
import { GetReviewEvalRunHandler, ListReviewEvalRunsHandler } from './review-draft/eval/application/review-eval-runs.queries.js';
import { ReviewEvalRunner } from './review-draft/eval/application/review-eval-runner.js';
import { RunReviewEvalHandler } from './review-draft/eval/application/run-review-eval.handler.js';
import { PrismaEvalRunRepository } from './review-draft/eval/infrastructure/prisma-eval-run.repository.js';
import { AdminReviewEvalsController } from './review-draft/eval/presentation/admin-review-evals.controller.js';

/** Agents: `diagnostic` (plan 77), `review_draft` and `review_direct` (plan 79); each agent plan adds its own folder here. */
@Module({
  imports: [GatewayModule],
  controllers: [AdminDiagnosticController, AdminReviewDraftController, AdminReviewEvalsController],
  providers: [
    RunDiagnosticHandler,
    TryTranslateReviewHandler,
    AdminPayerResolver,
    // review_draft into the teacher's queue (plan 79, step 1.3)
    DraftReviewHandler,
    SchoolPayerResolver,
    RoutedForReviewConsumer,
    // review_direct for a learner without a school, from the same event (plan 79, step 2.2c)
    DirectReviewHandler,
    LearnerPayerResolver,
    // candidate models measured on the settled drafts (plan 79, step 1.6)
    RunReviewEvalHandler,
    ListReviewEvalRunsHandler,
    GetReviewEvalRunHandler,
    ReviewEvalRunner,
    { provide: EVAL_RUN_REPOSITORY, useClass: PrismaEvalRunRepository },
    {
      provide: REVIEW_ATTEMPTS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpReviewAttemptsClient(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: DIRECT_REVIEW_ATTEMPTS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpDirectReviewAttemptsClient(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: LEARNER_LANGUAGE_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpLearnerLanguageReader(config.get<string>('profileServiceUrl')!, config.get<string>('internalServiceToken')!),
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
