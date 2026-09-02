import { Module } from '@nestjs/common';
import { AttemptEvidenceConsumer } from './consumers/attempt-evidence.consumer.js';
import { EnrollmentConsumer } from './consumers/enrollment.consumer.js';
import { ProgressActivityConsumer } from './consumers/progress-activity.consumer.js';
import { SrsLimitRefusedConsumer } from './consumers/srs-limit-refused.consumer.js';
import { MasteryController } from './mastery/mastery.controller.js';
import { SkillMasteryProjector } from './mastery/skill-mastery.projector.js';
import { SeedService } from './seed/seed.service.js';

@Module({
  controllers: [MasteryController],
  providers: [
    AttemptEvidenceConsumer,
    EnrollmentConsumer,
    ProgressActivityConsumer,
    SrsLimitRefusedConsumer,
    SkillMasteryProjector,
    SeedService,
  ],
})
export class MetricsModule {}
