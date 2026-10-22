import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { PutAiDraftHandler } from './application/commands/put-ai-draft/put-ai-draft.handler.js';
import { ATTEMPT_AI_DRAFT_REPOSITORY } from './domain/repositories/attempt-ai-draft.repository.js';
import { PrismaAttemptAiDraftRepository } from './infrastructure/persistence/prisma-attempt-ai-draft.repository.js';
import { InternalAiDraftsController } from './presentation/controllers/internal-ai-drafts.controller.js';

/**
 * Model-drafted reviews of submissions (plan 79). ai-service writes them; the review card
 * reads them (step 1.4) and the verdict settles them (step 1.5).
 */
@Module({
  imports: [CqrsModule, AttemptsModule],
  controllers: [InternalAiDraftsController],
  providers: [
    PrismaAttemptAiDraftRepository,
    { provide: ATTEMPT_AI_DRAFT_REPOSITORY, useExisting: PrismaAttemptAiDraftRepository },
    PutAiDraftHandler,
  ],
  exports: [ATTEMPT_AI_DRAFT_REPOSITORY],
})
export class AiDraftsModule {}
