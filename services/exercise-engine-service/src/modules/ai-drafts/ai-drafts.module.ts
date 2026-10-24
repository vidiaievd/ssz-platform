import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { GiveUpAiReviewHandler } from './application/commands/give-up-ai-review/give-up-ai-review.handler.js';
import { PutAiDraftHandler } from './application/commands/put-ai-draft/put-ai-draft.handler.js';
import { PutAiReviewHandler } from './application/commands/put-ai-review/put-ai-review.handler.js';
import { SettleAiDraftHandler } from './application/commands/settle-ai-draft/settle-ai-draft.handler.js';
import { GetDraftForReviewHandler } from './application/queries/get-draft-for-review/get-draft-for-review.handler.js';
import { GetReviewSubjectHandler } from './application/queries/get-review-subject/get-review-subject.handler.js';
import { ListReviewCasesHandler } from './application/queries/list-review-cases/list-review-cases.handler.js';
import { ATTEMPT_AI_DRAFT_REPOSITORY } from './domain/repositories/attempt-ai-draft.repository.js';
import { PrismaAttemptAiDraftRepository } from './infrastructure/persistence/prisma-attempt-ai-draft.repository.js';
import { InternalAiDraftsController } from './presentation/controllers/internal-ai-drafts.controller.js';
import { InternalAiReviewController } from './presentation/controllers/internal-ai-review.controller.js';
import { InternalNoReviewerController } from './presentation/controllers/internal-no-reviewer.controller.js';
import { InternalReviewCasesController } from './presentation/controllers/internal-review-cases.controller.js';
import { InternalReviewSubjectController } from './presentation/controllers/internal-review-subject.controller.js';

/**
 * Model-drafted reviews of submissions (plan 79). ai-service reads what to review (the
 * submission beside its key) and writes the draft back; the review card
 * reads them (step 1.4), the verdict settles them (step 1.5) and the settled ones are the
 * set candidate models are measured on (step 1.6). For a learner nobody reviews, the model's
 * review comes with a verdict that closes the attempt (step 2.1b) — or, when no model can
 * read it, the attempt closes as `NO_REVIEWER` (step 2.2a).
 */
@Module({
  imports: [CqrsModule, AttemptsModule],
  controllers: [
    InternalAiDraftsController,
    InternalAiReviewController,
    InternalNoReviewerController,
    InternalReviewSubjectController,
    InternalReviewCasesController,
  ],
  providers: [
    PrismaAttemptAiDraftRepository,
    { provide: ATTEMPT_AI_DRAFT_REPOSITORY, useExisting: PrismaAttemptAiDraftRepository },
    PutAiDraftHandler,
    PutAiReviewHandler,
    GiveUpAiReviewHandler,
    SettleAiDraftHandler,
    GetReviewSubjectHandler,
    GetDraftForReviewHandler,
    ListReviewCasesHandler,
  ],
  exports: [ATTEMPT_AI_DRAFT_REPOSITORY],
})
export class AiDraftsModule {}
