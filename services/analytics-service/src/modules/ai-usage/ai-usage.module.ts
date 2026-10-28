import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AiCallCompletedConsumer } from './consumers/ai-call-completed.consumer.js';
import { AttemptAiReviewConsumer } from './consumers/attempt-ai-review.consumer.js';
import { AssistFeedbackConsumer } from './consumers/assist-feedback.consumer.js';
import { AttemptReviewedDraftConsumer } from './consumers/attempt-reviewed-draft.consumer.js';
import { AiUsageController } from './controllers/ai-usage.controller.js';
import { GetAiUsageHandler } from './queries/get-ai-usage.handler.js';
import { GetAiDraftQualityHandler } from './queries/get-ai-draft-quality.handler.js';
import { GetAiAssistQualityHandler } from './queries/get-ai-assist-quality.handler.js';

@Module({
  imports: [CqrsModule],
  controllers: [AiUsageController],
  providers: [
    AiCallCompletedConsumer,
    GetAiUsageHandler,
    // What teachers made of review drafts, per model and prompt (plan 79, 1.5).
    AttemptReviewedDraftConsumer,
    // Models' reviews delivered to learners and the ones they disputed (2.3b).
    AttemptAiReviewConsumer,
    GetAiDraftQualityHandler,
    // Learners' marks on the assistant's answers (plan 83, step 7).
    AssistFeedbackConsumer,
    GetAiAssistQualityHandler,
  ],
})
export class AiUsageModule {}
