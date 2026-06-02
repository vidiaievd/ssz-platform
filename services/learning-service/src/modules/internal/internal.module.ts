import { Module } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { AnalyticsSnapshotController } from './analytics-snapshot.controller.js';

@Module({
  controllers: [AnalyticsSnapshotController],
  providers: [InternalAuthGuard],
})
export class InternalModule {}
