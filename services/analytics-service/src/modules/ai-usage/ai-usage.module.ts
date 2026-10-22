import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AiCallCompletedConsumer } from './consumers/ai-call-completed.consumer.js';
import { AttemptReviewedDraftConsumer } from './consumers/attempt-reviewed-draft.consumer.js';
import { AiUsageController } from './controllers/ai-usage.controller.js';
import { GetAiUsageHandler } from './queries/get-ai-usage.handler.js';
import { GetAiDraftQualityHandler } from './queries/get-ai-draft-quality.handler.js';

@Module({
  imports: [CqrsModule],
  controllers: [AiUsageController],
  providers: [
    AiCallCompletedConsumer,
    GetAiUsageHandler,
    // What teachers made of review drafts, per model and prompt (plan 79, 1.5).
    AttemptReviewedDraftConsumer,
    GetAiDraftQualityHandler,
  ],
})
export class AiUsageModule {}
