import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { WorkloadCalculatorService } from './application/services/workload-calculator.service.js';
import { UpdateWorkloadPolicyHandler } from './application/commands/update-workload-policy/update-workload-policy.handler.js';
import { WorkloadController } from './presentation/controllers/workload.controller.js';
import { SlotsModule } from '../slots/slots.module.js';

@Module({
  imports: [CqrsModule, SlotsModule],
  controllers: [WorkloadController],
  providers: [WorkloadCalculatorService, UpdateWorkloadPolicyHandler],
  exports: [WorkloadCalculatorService],
})
export class WorkloadModule {}
