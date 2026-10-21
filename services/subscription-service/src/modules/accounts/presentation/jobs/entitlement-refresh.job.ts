import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { IntervalJob } from '../../../../common/jobs/interval-job.js';
import type { AppConfig } from '../../../../config/configuration.js';
import { RefreshDueAccountsCommand } from '../../application/commands/refresh-due-accounts/refresh-due-accounts.command.js';

/**
 * The plan's "daily task", run every minute by default: it only touches accounts whose
 * snapshot time has overtaken (an indexed `next_refresh_at`), so a short interval is cheap
 * and keeps a grant's end from outliving itself by up to a day in ai-service.
 */
@Injectable()
export class EntitlementRefreshJob extends IntervalJob {
  constructor(
    private readonly commands: CommandBus,
    config: ConfigService<AppConfig>,
  ) {
    super(config.get<AppConfig['jobs']>('jobs')!.entitlementRefreshIntervalMs);
  }

  protected async tick(): Promise<void> {
    const refreshed = await this.commands.execute<RefreshDueAccountsCommand, number>(new RefreshDueAccountsCommand());
    if (refreshed > 0) this.logger.log(`Refreshed ${refreshed} account(s) whose entitlements time had changed`);
  }
}
