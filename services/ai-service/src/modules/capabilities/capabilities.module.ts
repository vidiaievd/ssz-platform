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
import { AskAssistantHandler } from './student-assist/application/ask-assistant/ask-assistant.handler.js';
import { GetAssistAvailabilityHandler } from './student-assist/application/assist-availability/assist-availability.query.js';
import { AssistPayerResolver } from './student-assist/application/assist-payer.resolver.js';
import { AssistToolbox } from './student-assist/application/assist-toolbox.js';
import {
  ATTEMPT_SCOPE_READER,
  CLASS_SESSION_READER,
  COURSE_LANGUAGE_READER,
  COURSE_MATERIAL_READER,
  ENROLLMENT_READER,
  GROUP_ROSTER_READER,
  MASTERY_READER,
  REVIEWED_WORK_READER,
  STUDENT_STANDING_READER,
} from './student-assist/application/ports/assist-readers.js';
import { ASSIST_RATE_LIMITER } from './student-assist/application/ports/assist-rate-limiter.js';
import {
  HttpAttemptScopeReader,
  HttpClassSessionReader,
  HttpCourseLanguageReader,
  HttpCourseMaterialReader,
  HttpEnrollmentReader,
  HttpGroupRosterReader,
  HttpMasteryReader,
  HttpReviewedWorkReader,
  HttpStudentStandingReader,
} from './student-assist/infrastructure/http-assist-readers.js';
import { RedisAssistRateLimiter } from './student-assist/infrastructure/redis-assist-rate-limiter.js';
import { AssistRateLimitGuard } from './student-assist/presentation/assist-rate-limit.guard.js';
import { AssistController } from './student-assist/presentation/assist.controller.js';
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
import { RECORDING_AUDIO_SOURCE } from './voice-review/application/ports/recording-audio.source.js';
import { VOICE_REVIEW_ATTEMPTS_CLIENT } from './voice-review/application/ports/voice-review-attempts.client.js';
import { VoiceReviewHandler } from './voice-review/application/voice-review/voice-review.handler.js';
import { HttpRecordingAudioSource } from './voice-review/infrastructure/http-recording-audio.source.js';
import { HttpVoiceReviewAttemptsClient } from './voice-review/infrastructure/http-voice-review-attempts.client.js';
import { READING_CASES_CLIENT } from './voice-review/eval/application/ports/reading-cases.client.js';
import { RunVoiceEvalHandler } from './voice-review/eval/application/run-voice-eval.handler.js';
import { GetVoiceEvalRunHandler, ListVoiceEvalRunsHandler } from './voice-review/eval/application/voice-eval-runs.queries.js';
import { VoiceEvalRunner } from './voice-review/eval/application/voice-eval-runner.js';
import { HttpReadingCasesClient } from './voice-review/eval/infrastructure/http-reading-cases.client.js';
import { AdminVoiceEvalsController } from './voice-review/eval/presentation/admin-voice-evals.controller.js';

/**
 * Agents: `diagnostic` (plan 77), `review_draft` and `review_direct` (plan 79), `voice_review`
 * (plan 82); each agent plan adds its own folder here.
 */
@Module({
  imports: [GatewayModule],
  controllers: [
    AdminDiagnosticController,
    AdminReviewDraftController,
    AdminReviewEvalsController,
    AdminVoiceEvalsController,
    AssistController,
  ],
  providers: [
    // the learner's HTTP API of the assistant (plan 83, step 5)
    GetAssistAvailabilityHandler,
    AssistRateLimitGuard,
    { provide: ASSIST_RATE_LIMITER, useClass: RedisAssistRateLimiter },
    // the student assistant's read-only tools (plan 83, step 2)
    AssistToolbox,
    {
      provide: COURSE_MATERIAL_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpCourseMaterialReader(config.get<string>('contentServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: MASTERY_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpMasteryReader(config.get<string>('analyticsServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: REVIEWED_WORK_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpReviewedWorkReader(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: CLASS_SESSION_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpClassSessionReader(config.get<string>('schedulingServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
    // the turn's loop and the course language its prompt names (plan 83, step 4e)
    AskAssistantHandler,
    {
      provide: COURSE_LANGUAGE_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpCourseLanguageReader(config.get<string>('contentServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
    // who pays for a turn, and whether the learner may ask in its context (plan 83, step 3)
    AssistPayerResolver,
    {
      provide: ENROLLMENT_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpEnrollmentReader(config.get<string>('learningServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: ATTEMPT_SCOPE_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpAttemptScopeReader(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: GROUP_ROSTER_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpGroupRosterReader(config.get<string>('organizationServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: STUDENT_STANDING_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpStudentStandingReader(config.get<string>('organizationServiceUrl')!, config.get<string>('internalServiceToken')!),
    },
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
    // voice_review of a reading aloud, from the same event (plan 82, step 8)
    VoiceReviewHandler,
    // candidate models measured on the settled drafts (plan 79, step 1.6)
    RunReviewEvalHandler,
    ListReviewEvalRunsHandler,
    GetReviewEvalRunHandler,
    ReviewEvalRunner,
    { provide: EVAL_RUN_REPOSITORY, useClass: PrismaEvalRunRepository },
    // speech models measured on the readings teachers ruled on, same runs table (plan 82, step 10b)
    RunVoiceEvalHandler,
    ListVoiceEvalRunsHandler,
    GetVoiceEvalRunHandler,
    VoiceEvalRunner,
    {
      provide: READING_CASES_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpReadingCasesClient(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
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
      provide: VOICE_REVIEW_ATTEMPTS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpVoiceReviewAttemptsClient(config.get<string>('exerciseEngineUrl')!, config.get<string>('internalServiceToken')!),
    },
    {
      provide: RECORDING_AUDIO_SOURCE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) =>
        new HttpRecordingAudioSource(config.get<string>('mediaServiceUrl')!, config.get<string>('internalServiceToken')!),
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
