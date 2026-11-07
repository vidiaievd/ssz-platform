import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { AnalyticsSnapshotController } from './analytics-snapshot.controller.js';
import { AssistEnrollmentController } from './assist-enrollment.controller.js';
import { SrsAtomCardsController } from './srs-atom-cards.controller.js';
import { LearnerGrammarAtomsController } from './learner-grammar-atoms.controller.js';
import { LearnerSoundAtomsController } from './learner-sound-atoms.controller.js';

@Module({
  imports: [CqrsModule],
  controllers: [
    AnalyticsSnapshotController,
    SrsAtomCardsController,
    AssistEnrollmentController,
    LearnerGrammarAtomsController,
    LearnerSoundAtomsController,
  ],
  providers: [InternalAuthGuard],
})
export class InternalModule {}
