import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_MAINTENANCE } from '../../infrastructure/queues/queue-names.js';
import { SweepsModule } from '../sweeps/sweeps.module.js';
import { MaintenanceWorker } from './maintenance.worker.js';
import { OrphanSweepScheduler } from './orphan-sweep.scheduler.js';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_MAINTENANCE }), SweepsModule],
  providers: [OrphanSweepScheduler, MaintenanceWorker],
})
export class MaintenanceModule {}
