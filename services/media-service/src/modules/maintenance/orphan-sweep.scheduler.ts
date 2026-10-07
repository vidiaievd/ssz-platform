import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_MAINTENANCE } from '../../infrastructure/queues/queue-names.js';

export const SWEEP_ORPHANS_JOB = 'sweep-orphan-recordings';
const SCHEDULER_ID = 'orphan-recordings-daily';
/** Every night at 03:30 server time — after the evening's hand-ins, before the morning's. */
export const SWEEP_CRON = '30 3 * * *';

/**
 * Keeps one repeating job in the queue. `upsertJobScheduler` is idempotent by id: every replica
 * and every restart declares the same schedule, and redis holds a single one — so the sweep is
 * queued once a night however many instances are up.
 */
@Injectable()
export class OrphanSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(OrphanSweepScheduler.name);

  constructor(@InjectQueue(QUEUE_MAINTENANCE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(SCHEDULER_ID, { pattern: SWEEP_CRON }, { name: SWEEP_ORPHANS_JOB });
      this.logger.log(`orphan recording sweep scheduled (${SWEEP_CRON})`);
    } catch (err) {
      // A schedule that cannot be declared must not keep uploads from working.
      this.logger.error(`could not schedule the orphan sweep: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
