import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CONTENT_CLEANUP_LOCK, type IContentCleanupLock } from '../ports/cleanup-lock.port.js';
import { SCHOOL_PURGE_LEDGER, type ISchoolPurgeLedger } from '../ports/school-purge.ledger.port.js';
import {
  CleanupObsoleteCoursesCommand,
  PurgeSchoolMaterialsCommand,
  RunContentCleanupCommand,
  SCHOOL_PURGE_SETTINGS,
  type SchoolPurgeSettings,
} from './school-lifecycle.commands.js';

/** Unfinished purges taken per run; the rest wait for the next one. */
export const PURGES_PER_RUN = 20;

export interface RunContentCleanupResult {
  /** `false` — another instance holds the lock; nothing was done. */
  ran: boolean;
  purgesRetried: number;
  purgesFailed: number;
}

/**
 * One run of the cleanup job (plan 90, phase 5, step 4c): first the school purges that did not
 * finish (4b-fix item 3), so their kept courses are `obsolete` before the cleanup looks, then the
 * obsolete courses.
 */
@CommandHandler(RunContentCleanupCommand)
export class RunContentCleanupHandler implements ICommandHandler<
  RunContentCleanupCommand,
  RunContentCleanupResult
> {
  private readonly logger = new Logger(RunContentCleanupHandler.name);

  constructor(
    @Inject(CONTENT_CLEANUP_LOCK) private readonly lock: IContentCleanupLock,
    @Inject(SCHOOL_PURGE_LEDGER) private readonly ledger: ISchoolPurgeLedger,
    @Inject(SCHOOL_PURGE_SETTINGS) private readonly settings: SchoolPurgeSettings,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(): Promise<RunContentCleanupResult> {
    const result: RunContentCleanupResult = { ran: false, purgesRetried: 0, purgesFailed: 0 };
    result.ran = await this.lock.run(async () => {
      const stalled = await this.ledger.findStalled(
        new Date(Date.now() - this.settings.purgeRetryAfterMs),
        PURGES_PER_RUN,
      );
      for (const purge of stalled) {
        result.purgesRetried += 1;
        try {
          await this.commandBus.execute(
            new PurgeSchoolMaterialsCommand(purge.schoolId, purge.schoolName),
          );
        } catch (err) {
          result.purgesFailed += 1;
          this.logger.error(
            `Purge of school ${purge.schoolId} failed again (attempt ${purge.attempts + 1}): ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      await this.commandBus.execute(new CleanupObsoleteCoursesCommand());
    });
    if (!result.ran) this.logger.debug('Cleanup skipped: another instance is running it');
    return result;
  }
}
