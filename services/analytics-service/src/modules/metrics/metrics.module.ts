import { Module } from '@nestjs/common';
import { AttemptEvidenceConsumer } from './consumers/attempt-evidence.consumer.js';
import { EnrollmentConsumer } from './consumers/enrollment.consumer.js';
import { ProgressActivityConsumer } from './consumers/progress-activity.consumer.js';
import { SubmissionConsumer } from './consumers/submission.consumer.js';
import { SeedService } from './seed/seed.service.js';

@Module({
  providers: [
    AttemptEvidenceConsumer,
    EnrollmentConsumer,
    ProgressActivityConsumer,
    SubmissionConsumer,
    SeedService,
  ],
})
export class MetricsModule {}
