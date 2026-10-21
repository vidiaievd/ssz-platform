import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AiCallCompletedConsumer } from './consumers/ai-call-completed.consumer.js';
import { AiUsageController } from './controllers/ai-usage.controller.js';
import { GetAiUsageHandler } from './queries/get-ai-usage.handler.js';

@Module({
  imports: [CqrsModule],
  controllers: [AiUsageController],
  providers: [AiCallCompletedConsumer, GetAiUsageHandler],
})
export class AiUsageModule {}
