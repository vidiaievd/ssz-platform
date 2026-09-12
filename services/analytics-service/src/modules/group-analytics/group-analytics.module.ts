import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { GroupAnalyticsController } from './controllers/group-analytics.controller.js';
import { GetGroupProgressHandler } from './queries/get-group-progress.handler.js';
import { GetGroupHeatmapHandler } from './queries/get-group-heatmap.handler.js';
import { GroupUnitsService } from './group-units.service.js';
import { WorkContextService } from './work-context.service.js';
import { SchedulingClient } from '../../infrastructure/http/scheduling.client.js';
import { ProjectionsModule } from '../projections/projections.module.js';

@Module({
  imports: [CqrsModule, ProjectionsModule],
  controllers: [GroupAnalyticsController],
  providers: [
    GetGroupProgressHandler,
    GetGroupHeatmapHandler,
    GroupUnitsService,
    WorkContextService,
    SchedulingClient,
  ],
  // The learner's screens (phase 4) read the same units and the same buckets as the
  // chart and the heatmap — one count each, never two.
  exports: [GroupUnitsService, WorkContextService],
})
export class GroupAnalyticsModule {}
