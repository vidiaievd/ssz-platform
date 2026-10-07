import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_MAINTENANCE } from '../../infrastructure/queues/queue-names.js';
import { SweepOrphanRecordingsService } from '../assets/application/services/sweep-orphan-recordings.service.js';
import { SWEEP_ORPHANS_JOB } from './orphan-sweep.scheduler.js';

/** One job at a time (BullMQ's default concurrency of 1): two sweeps never overlap on a node. */
@Processor(QUEUE_MAINTENANCE)
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(private readonly sweep: SweepOrphanRecordingsService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== SWEEP_ORPHANS_JOB) {
      this.logger.warn(`ignoring unknown maintenance job "${job.name}"`);
      return null;
    }
    // The configured mode: a scheduled run does what the operator set, a dry run by default.
    return this.sweep.run();
  }
}
