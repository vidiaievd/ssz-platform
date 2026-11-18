import { randomUUID } from 'node:crypto';
import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SchoolPurgedEvent, SchoolPurgeReminderEvent } from '../../domain/events/school-purge.events.js';
import {
  SCHOOL_LIFECYCLE_TIMER_REPOSITORY,
  type ISchoolLifecycleTimerRepository,
} from '../../domain/school-lifecycle.repository.js';
import { purgeReminderDue, purgeSchool } from '../../domain/school-lifecycle.js';
import { SchoolTransitionNotAllowedException } from '../../domain/school-transition-not-allowed.exception.js';
import { ChangeSchoolStatusCommand } from './change-school-status.command.js';
import { LIFECYCLE_CLOCK, type LifecycleClock } from './change-school-status.handler.js';
import { RunSchoolLifecycleCommand, type SchoolLifecycleRunResult } from './run-school-lifecycle.command.js';

/** Schools of each kind one run takes on; the rest wait for the next run. */
export const LIFECYCLE_BATCH = 50;

/**
 * Closes suspended schools whose time ran out (through the same move an admin makes, actor
 * `system`), purges closed ones whose date came, then reminds owners 30 / 7 days ahead. Purging goes
 * before reminding, so a school purged in this run is never reminded about. One school failing is
 * logged and skipped; the next run tries it again.
 */
@CommandHandler(RunSchoolLifecycleCommand)
export class RunSchoolLifecycleHandler implements ICommandHandler<RunSchoolLifecycleCommand, SchoolLifecycleRunResult> {
  private readonly logger = new Logger(RunSchoolLifecycleHandler.name);

  constructor(
    @Inject(SCHOOL_LIFECYCLE_TIMER_REPOSITORY) private readonly repository: ISchoolLifecycleTimerRepository,
    @Inject(LIFECYCLE_CLOCK) private readonly clock: LifecycleClock,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(): Promise<SchoolLifecycleRunResult> {
    const result: SchoolLifecycleRunResult = { ran: false, closed: 0, purged: 0, reminded: 0, failed: 0 };
    result.ran = await this.repository.withTimerLock(async () => {
      const due = await this.repository.findDue(this.clock(), LIFECYCLE_BATCH);

      for (const schoolId of due.closing) {
        await this.each(result, 'close', schoolId, async () => {
          await this.commandBus.execute(new ChangeSchoolStatusCommand(schoolId, 'close', { kind: 'system' }, null));
          result.closed++;
        });
      }

      for (const state of due.purging) {
        await this.each(result, 'purge', state.schoolId, async () => {
          const now = this.clock();
          const purged = purgeSchool(state, now);
          if (purged.isErr) return;
          const counts = await this.repository.purge(state, purged.value, new SchoolPurgedEvent(randomUUID(), state, now));
          if (!counts) return; // restored or moved meanwhile
          result.purged++;
          this.logger.log(`Purged school ${state.schoolId}: ${JSON.stringify(counts)}`);
        });
      }

      for (const { state, sent } of due.reminding) {
        await this.each(result, 'remind', state.schoolId, async () => {
          const now = this.clock();
          const reminder = purgeReminderDue(state.purgeAt, sent, now);
          if (!reminder) return;
          const event = new SchoolPurgeReminderEvent(randomUUID(), state, reminder, now);
          if (await this.repository.markReminded(state, reminder, event, now)) result.reminded++;
        });
      }
    });

    if (result.closed + result.purged + result.reminded + result.failed > 0) {
      this.logger.log(
        `Lifecycle run: closed ${result.closed}, purged ${result.purged}, reminded ${result.reminded}, failed ${result.failed}`,
      );
    }
    return result;
  }

  private async each(result: SchoolLifecycleRunResult, what: string, schoolId: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (err) {
      // Someone moved it first (an admin reactivated a school about to close): nothing to do.
      if (err instanceof SchoolTransitionNotAllowedException) return;
      result.failed++;
      this.logger.error(`Could not ${what} school ${schoolId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
