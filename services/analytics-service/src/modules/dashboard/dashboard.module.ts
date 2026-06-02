import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DashboardController } from './controllers/dashboard.controller.js';
import { GetKpisHandler } from './queries/get-kpis.handler.js';
import { GetAtRiskHandler } from './queries/get-at-risk.handler.js';
import { GetCourseHealthHandler } from './queries/get-course-health.handler.js';

@Module({
  imports: [CqrsModule],
  controllers: [DashboardController],
  providers: [GetKpisHandler, GetAtRiskHandler, GetCourseHealthHandler],
})
export class DashboardModule {}
