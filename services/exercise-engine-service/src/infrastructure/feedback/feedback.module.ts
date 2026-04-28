import { Global, Module } from '@nestjs/common';
import { FEEDBACK_GENERATOR } from '../../shared/application/ports/feedback-generator.port.js';
import { RuleBasedFeedbackGenerator } from './rule-based-feedback-generator.js';

@Global()
@Module({
  providers: [
    RuleBasedFeedbackGenerator,
    { provide: FEEDBACK_GENERATOR, useExisting: RuleBasedFeedbackGenerator },
  ],
  exports: [FEEDBACK_GENERATOR],
})
export class FeedbackModule {}
