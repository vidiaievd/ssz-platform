import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../domain/repositories/probe-task.repository.js';

/**
 * What makes a probe actually disappear.
 *
 * Expiry is enforced twice, and the two halves answer different questions. The entity
 * refuses an expired probe on read, which is what the *learner* meets: the moment it is
 * past its time it opens for nobody, whether or not a row still exists. This is the other
 * half — the row going away, so the table holds what is live rather than everything ever
 * generated.
 *
 * Deliberately not a scheduled job. It is called when probes are made, which is the only
 * time the table grows, and it can be asked for by an operator on an internal route.
 */
@Injectable()
export class ProbeSweeper {
  private readonly logger = new Logger(ProbeSweeper.name);
  private readonly batch: number;

  constructor(
    @Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository,
    config: ConfigService<AppConfig>,
  ) {
    this.batch = config.get<AppConfig['probes']>('probes')!.sweepBatch;
  }

  /** Returns how many rows went, so a caller that asked for a sweep can be told. */
  async sweep(now: Date = new Date()): Promise<number> {
    const deleted = await this.probes.deleteExpired(now, this.batch);
    if (deleted > 0) {
      this.logger.log(`Swept ${deleted} expired probe(s)`);
    }
    return deleted;
  }
}
