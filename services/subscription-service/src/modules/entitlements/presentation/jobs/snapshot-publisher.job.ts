import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { IntervalJob } from '../../../../common/jobs/interval-job.js';
import type { AppConfig } from '../../../../config/configuration.js';
import { PublishSnapshotsCommand } from '../../application/commands/publish-snapshots/publish-snapshots.command.js';

/** Moves pending entitlement snapshots onto the outbox; the relay takes them from there. */
@Injectable()
export class SnapshotPublisherJob extends IntervalJob {
  constructor(
    private readonly commands: CommandBus,
    config: ConfigService<AppConfig>,
  ) {
    super(config.get<AppConfig['jobs']>('jobs')!.snapshotPublishIntervalMs);
  }

  protected async tick(): Promise<void> {
    const sent = await this.commands.execute<PublishSnapshotsCommand, number>(new PublishSnapshotsCommand());
    if (sent > 0) this.logger.log(`Queued ${sent} entitlement snapshot(s)`);
  }
}
