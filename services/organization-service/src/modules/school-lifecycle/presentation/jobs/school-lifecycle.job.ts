import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import type { Env } from '../../../../config/configuration.js';
import { IntervalJob } from '../../../../common/jobs/interval-job.js';
import { RunSchoolLifecycleCommand } from '../../application/commands/run-school-lifecycle.command.js';

/** The lifecycle timer (plan 90, phase 5): every `SCHOOL_LIFECYCLE_INTERVAL_MS` (10 min by default). */
@Injectable()
export class SchoolLifecycleJob extends IntervalJob {
  constructor(
    private readonly commandBus: CommandBus,
    config: ConfigService<Env>,
  ) {
    super(config.get('SCHOOL_LIFECYCLE_INTERVAL_MS') ?? 600_000);
  }

  protected async tick(): Promise<void> {
    await this.commandBus.execute(new RunSchoolLifecycleCommand());
  }
}
