import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { GroupAnalyticsController } from './controllers/group-analytics.controller.js';
import { GetGroupProgressHandler } from './queries/get-group-progress.handler.js';
import { GroupUnitsService } from './group-units.service.js';
import { SchedulingClient } from '../../infrastructure/http/scheduling.client.js';
import { ProjectionsModule } from '../projections/projections.module.js';

@Module({
  imports: [CqrsModule, ProjectionsModule],
  controllers: [GroupAnalyticsController],
  providers: [GetGroupProgressHandler, GroupUnitsService, SchedulingClient],
  // The heatmap (phase 3) and the learner's grid (phase 4) count from the same units.
  exports: [GroupUnitsService],
})
export class GroupAnalyticsModule {}
