import { Module } from '@nestjs/common';
import { AlertEscalationService } from './application/services/alert-escalation.service.js';
import { AlertsController } from './presentation/controllers/alerts.controller.js';

@Module({
  controllers: [AlertsController],
  providers: [AlertEscalationService],
})
export class AlertsModule {}
