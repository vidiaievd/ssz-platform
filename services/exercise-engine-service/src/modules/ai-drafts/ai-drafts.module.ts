import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { PutAiDraftHandler } from './application/commands/put-ai-draft/put-ai-draft.handler.js';
import { SettleAiDraftHandler } from './application/commands/settle-ai-draft/settle-ai-draft.handler.js';
import { GetDraftForReviewHandler } from './application/queries/get-draft-for-review/get-draft-for-review.handler.js';
import { GetReviewSubjectHandler } from './application/queries/get-review-subject/get-review-subject.handler.js';
import { ATTEMPT_AI_DRAFT_REPOSITORY } from './domain/repositories/attempt-ai-draft.repository.js';
import { PrismaAttemptAiDraftRepository } from './infrastructure/persistence/prisma-attempt-ai-draft.repository.js';
import { InternalAiDraftsController } from './presentation/controllers/internal-ai-drafts.controller.js';
import { InternalReviewSubjectController } from './presentation/controllers/internal-review-subject.controller.js';

/**
 * Model-drafted reviews of submissions (plan 79). ai-service reads what to review (the
 * submission beside its key) and writes the draft back; the review card
 * reads them (step 1.4) and the verdict settles them (step 1.5).
 */
@Module({
  imports: [CqrsModule, AttemptsModule],
  controllers: [InternalAiDraftsController, InternalReviewSubjectController],
  providers: [
    PrismaAttemptAiDraftRepository,
    { provide: ATTEMPT_AI_DRAFT_REPOSITORY, useExisting: PrismaAttemptAiDraftRepository },
    PutAiDraftHandler,
    SettleAiDraftHandler,
    GetReviewSubjectHandler,
    GetDraftForReviewHandler,
  ],
  exports: [ATTEMPT_AI_DRAFT_REPOSITORY],
})
export class AiDraftsModule {}
