import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { GroupAnalyticsController } from './controllers/group-analytics.controller.js';
import { GetGroupProgressHandler } from './queries/get-group-progress.handler.js';
import { GetGroupHeatmapHandler } from './queries/get-group-heatmap.handler.js';
import { GroupUnitsService } from './group-units.service.js';
import { SchedulingClient } from '../../infrastructure/http/scheduling.client.js';
import { ProjectionsModule } from '../projections/projections.module.js';

@Module({
  imports: [CqrsModule, ProjectionsModule],
  controllers: [GroupAnalyticsController],
  providers: [GetGroupProgressHandler, GetGroupHeatmapHandler, GroupUnitsService, SchedulingClient],
  // The learner's grid (phase 4) counts from the same units as the chart and the heatmap.
  exports: [GroupUnitsService],
})
export class GroupAnalyticsModule {}
