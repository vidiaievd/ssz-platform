import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { IntervalJob } from '../../../../common/jobs/interval-job.js';
import type { AppConfig } from '../../../../config/configuration.js';
import { RunContentCleanupCommand } from '../../application/commands/school-lifecycle.commands.js';

/**
 * The cleanup timer (plan 90, phase 5, step 4c): unfinished school purges, then obsolete courses,
 * every `CONTENT_CLEANUP_INTERVAL_MS` (1 h by default).
 */
@Injectable()
export class ContentCleanupJob extends IntervalJob {
  constructor(
    private readonly commandBus: CommandBus,
    config: ConfigService<AppConfig>,
  ) {
    super(config.get<AppConfig['schoolPurge']>('schoolPurge')!.cleanupIntervalMs);
  }

  protected async tick(): Promise<void> {
    await this.commandBus.execute(new RunContentCleanupCommand());
  }
}
