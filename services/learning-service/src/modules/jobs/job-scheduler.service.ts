import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../../infrastructure/cache/redis.service.js';
import { MARK_OVERDUE_JOB } from './mark-overdue-assignments.worker.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

@Injectable()
export class JobSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(
    @InjectQueue('assignments') private readonly queue: Queue,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisService.getClient()) {
      this.logger.warn('Redis not available — job scheduling disabled');
      return;
    }

    try {
      await this.queue.upsertJobScheduler(
        'mark-overdue-scheduler',
        { every: FIVE_MINUTES_MS },
        {
          name: MARK_OVERDUE_JOB,
          data: {},
          opts: {
            removeOnComplete: { count: 20 },
            removeOnFail: { count: 100 },
          },
        },
      );
      this.logger.log(`"${MARK_OVERDUE_JOB}" job scheduled (every ${FIVE_MINUTES_MS / 1000}s)`);
    } catch (err) {
      this.logger.warn(
        `Failed to schedule "${MARK_OVERDUE_JOB}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
