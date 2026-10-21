import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AI_CALL_LEDGER, LedgerRecordRejected, type IAiCallLedger } from './ports/ai-call.ledger.js';
import { LEDGER_SPOOL, type ILedgerSpool, type SpooledEntry } from './ports/ledger-spool.js';

/** How often the spool is checked (AI_LEDGER_SPOOL_DRAIN_MS). */
export const SPOOL_DRAIN_INTERVAL_MS = Symbol('SPOOL_DRAIN_INTERVAL_MS');

const BATCH = 50;

/**
 * Moves spooled ledger rows into the database once it answers again (plan 77, step 8a).
 *
 * Oldest first, and it stops at the first row that still fails: the database is most likely
 * still away, and the rest waits for the next tick. The ledger write is idempotent by id, so
 * a row written but not yet removed from the spool (a crash between the two) is skipped
 * next time, not doubled. A row the database rejects outright goes to the dead letter list
 * instead of blocking everything behind it.
 */
@Injectable()
export class LedgerSpoolDrainer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerSpoolDrainer.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Logs the first failed tick of an outage, not every one of them. */
  private stuck = false;

  constructor(
    @Inject(AI_CALL_LEDGER) private readonly ledger: IAiCallLedger,
    @Inject(LEDGER_SPOOL) private readonly spool: ILedgerSpool,
    @Inject(SPOOL_DRAIN_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass over the oldest batch; returns how many entries left the spool. */
  async drainOnce(): Promise<number> {
    const removed = await this.spool.drain(BATCH, (entries) => this.consume(entries));
    return removed ?? 0;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.drainOnce();
    } catch (err) {
      this.logger.warn(`Ledger spool drain failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async consume(entries: SpooledEntry[]): Promise<number> {
    let done = 0;
    let written = 0;
    for (const entry of entries) {
      if (!entry.record) {
        this.logger.error(`Unreadable ledger spool entry moved to the dead letter list: ${entry.raw}`);
        await this.spool.deadLetter(entry.raw);
        done++;
        continue;
      }
      try {
        await this.ledger.record(entry.record);
        done++;
        written++;
      } catch (err) {
        if (err instanceof LedgerRecordRejected) {
          this.logger.error(`Ledger rejected spooled call ${entry.record.id}, moved to the dead letter list: ${err.message}`);
          await this.spool.deadLetter(entry.raw);
          done++;
          continue;
        }
        if (!this.stuck) this.logger.warn(`Ledger still unavailable, ${entries.length - done} spooled row(s) wait: ${String(err)}`);
        this.stuck = true;
        break;
      }
    }
    if (written > 0) {
      this.logger.log(`Moved ${written} ledger row(s) from the spool into the database`);
      this.stuck = false;
    }
    return done;
  }
}
