import { Module } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { AnalyticsSnapshotController } from './analytics-snapshot.controller.js';
import { AssistEnrollmentController } from './assist-enrollment.controller.js';
import { SrsAtomCardsController } from './srs-atom-cards.controller.js';

@Module({
  controllers: [AnalyticsSnapshotController, SrsAtomCardsController, AssistEnrollmentController],
  providers: [InternalAuthGuard],
})
export class InternalModule {}
