import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_MAINTENANCE } from '../../infrastructure/queues/queue-names.js';
import { SweepOrphanRecordingsService } from '../assets/application/services/sweep-orphan-recordings.service.js';
import { SweepSupersededNarrationsService } from '../assets/application/services/sweep-superseded-narrations.service.js';
import { SweepAbandonedUploadsService } from '../assets/application/services/sweep-abandoned-uploads.service.js';
import { SweepOrphanContentAssetsService } from '../assets/application/services/sweep-orphan-content-assets.service.js';
import {
  SWEEP_ABANDONED_JOB,
  SWEEP_CONTENT_JOB,
  SWEEP_ORPHANS_JOB,
  SWEEP_SUPERSEDED_JOB,
} from './orphan-sweep.scheduler.js';

/** One job at a time (BullMQ's default concurrency of 1): two sweeps never overlap on a node. */
@Processor(QUEUE_MAINTENANCE)
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(
    private readonly sweep: SweepOrphanRecordingsService,
    private readonly superseded: SweepSupersededNarrationsService,
    private readonly abandoned: SweepAbandonedUploadsService,
    private readonly content: SweepOrphanContentAssetsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    // The configured mode: a scheduled run does what the operator set, a dry run by default.
    if (job.name === SWEEP_ORPHANS_JOB) return this.sweep.run();
    if (job.name === SWEEP_SUPERSEDED_JOB) return this.superseded.run();
    if (job.name === SWEEP_ABANDONED_JOB) return this.abandoned.run();
    if (job.name === SWEEP_CONTENT_JOB) return this.content.run();
    this.logger.warn(`ignoring unknown maintenance job "${job.name}"`);
    return null;
  }
}
