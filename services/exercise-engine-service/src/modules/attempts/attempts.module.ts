import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ATTEMPT_REPOSITORY } from './domain/repositories/attempt.repository.js';
import { PrismaAttemptRepository } from './infrastructure/persistence/prisma-attempt.repository.js';
import { StartAttemptHandler } from './application/commands/start-attempt/start-attempt.handler.js';
import { SubmitAnswerHandler } from './application/commands/submit-answer/submit-answer.handler.js';
import { AbandonAttemptHandler } from './application/commands/abandon-attempt/abandon-attempt.handler.js';
import { RevealAnswersHandler } from './application/commands/reveal-answers/reveal-answers.handler.js';
import { SelfCheckHandler } from './application/commands/self-check/self-check.handler.js';
import { ReviewAttemptHandler } from './application/commands/review-attempt/review-attempt.handler.js';
import { BatchApproveHandler } from './application/commands/batch-approve/batch-approve.handler.js';
import { ClaimReviewHandler } from './application/commands/claim-review/claim-review.handler.js';
import { ReleaseReviewHandler } from './application/commands/release-review/release-review.handler.js';
import { GetAttemptByIdHandler } from './application/queries/get-attempt-by-id/get-attempt-by-id.handler.js';
import { ListUserAttemptsHandler } from './application/queries/list-user-attempts/list-user-attempts.handler.js';
import { ListReviewQueueV2Handler } from './application/queries/list-review-queue-v2/list-review-queue-v2.handler.js';
import { CountReviewQueueHandler } from './application/queries/count-review-queue/count-review-queue.handler.js';
import { AggregateReviewLoadHandler } from './application/queries/aggregate-review-load/aggregate-review-load.handler.js';
import { ListPendingReviewSchoolsHandler } from './application/queries/list-pending-review-schools/list-pending-review-schools.handler.js';
import { ListReviewDecisionsHandler } from './application/queries/list-review-decisions/list-review-decisions.handler.js';
import { ListMySubmissionsHandler } from './application/queries/list-my-submissions/list-my-submissions.handler.js';
import { GetSubmissionForReviewHandler } from './application/queries/get-submission-for-review/get-submission-for-review.handler.js';
import { ReviewScoring } from './application/services/review-scoring.js';
import { ReviewContextResolver } from './application/services/review-context-resolver.js';
import { AttemptsController } from './presentation/controllers/attempts.controller.js';
import { InternalReviewController } from './presentation/controllers/internal-review.controller.js';

const CommandHandlers = [
  StartAttemptHandler,
  SubmitAnswerHandler,
  AbandonAttemptHandler,
  RevealAnswersHandler,
  SelfCheckHandler,
  ReviewAttemptHandler,
  BatchApproveHandler,
  ClaimReviewHandler,
  ReleaseReviewHandler,
];
const QueryHandlers = [
  GetAttemptByIdHandler,
  ListUserAttemptsHandler,
  ListReviewQueueV2Handler,
  CountReviewQueueHandler,
  GetSubmissionForReviewHandler,
  AggregateReviewLoadHandler,
  ListPendingReviewSchoolsHandler,
  ListReviewDecisionsHandler,
  ListMySubmissionsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [AttemptsController, InternalReviewController],
  providers: [
    PrismaAttemptRepository,
    { provide: ATTEMPT_REPOSITORY, useExisting: PrismaAttemptRepository },
    ReviewContextResolver,
    ReviewScoring,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [ATTEMPT_REPOSITORY],
})
export class AttemptsModule {}
