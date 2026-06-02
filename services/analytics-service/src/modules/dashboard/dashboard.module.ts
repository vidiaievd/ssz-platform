import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { DashboardController } from './controllers/dashboard.controller.js';
import { GetKpisHandler } from './queries/get-kpis.handler.js';

@Module({
  imports: [CqrsModule],
  controllers: [DashboardController],
  providers: [GetKpisHandler],
})
export class DashboardModule {}
