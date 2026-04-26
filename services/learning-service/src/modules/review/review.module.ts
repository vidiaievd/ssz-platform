import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SUBMISSION_REPOSITORY } from './domain/repositories/submission.repository.interface.js';
import { CLOCK, SystemClock } from '../../shared/application/ports/clock.port.js';
import { PrismaSubmissionRepository } from './infrastructure/persistence/prisma-submission.repository.js';
import { SubmitExerciseHandler } from './application/commands/submit-exercise.handler.js';
import { ResubmitHandler } from './application/commands/resubmit.handler.js';
import { ReviewSubmissionHandler } from './application/commands/review-submission.handler.js';
import { GetSubmissionHandler } from './application/queries/get-submission.handler.js';
import { ListUserSubmissionsHandler } from './application/queries/list-user-submissions.handler.js';
import { ListPendingReviewsHandler } from './application/queries/list-pending-reviews.handler.js';
import { ReviewController } from './presentation/review.controller.js';

const CommandHandlers = [
  SubmitExerciseHandler,
  ResubmitHandler,
  ReviewSubmissionHandler,
];

const QueryHandlers = [
  GetSubmissionHandler,
  ListUserSubmissionsHandler,
  ListPendingReviewsHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [ReviewController],
  providers: [
    { provide: SUBMISSION_REPOSITORY, useClass: PrismaSubmissionRepository },
    { provide: CLOCK, useClass: SystemClock },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class ReviewModule {}
