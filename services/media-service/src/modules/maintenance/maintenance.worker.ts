import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_MAINTENANCE } from '../../infrastructure/queues/queue-names.js';
import { SweepRunner } from '../sweeps/application/sweep-runner.js';
import type { SweepKind } from '../sweeps/domain/sweep-run.js';
import {
  SWEEP_ABANDONED_JOB,
  SWEEP_CONTENT_JOB,
  SWEEP_ORPHANS_JOB,
  SWEEP_SUPERSEDED_JOB,
} from './orphan-sweep.scheduler.js';

const KIND_BY_JOB: Readonly<Record<string, SweepKind>> = {
  [SWEEP_ORPHANS_JOB]: 'orphan_recordings',
  [SWEEP_SUPERSEDED_JOB]: 'superseded_narrations',
  [SWEEP_ABANDONED_JOB]: 'abandoned_uploads',
  [SWEEP_CONTENT_JOB]: 'orphan_content',
};

/** One job at a time (BullMQ's default concurrency of 1): two sweeps never overlap on a node. */
@Processor(QUEUE_MAINTENANCE)
export class MaintenanceWorker extends WorkerHost {
  private readonly logger = new Logger(MaintenanceWorker.name);

  constructor(private readonly runner: SweepRunner) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const kind = KIND_BY_JOB[job.name];
    if (!kind) {
      this.logger.warn(`ignoring unknown maintenance job "${job.name}"`);
      return null;
    }
    // No mode: a scheduled run does what the operator set (`MEDIA_ORPHAN_SWEEP_MODE`), a dry run by default.
    return this.runner.run(kind, { trigger: 'nightly' });
  }
}
