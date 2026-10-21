import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LEDGER_USAGE_READER, type ILedgerUsageReader } from '../../ledger/application/ports/ledger-usage.reader.js';
import { QUOTA_COUNTER, type IQuotaCounter } from './ports/quota-counter.js';

export const QUOTA_RECONCILE_INTERVAL_MS = Symbol('QUOTA_RECONCILE_INTERVAL_MS');

/** Long enough for a full pass over the counters; a crashed holder frees it by expiry. */
const LOCK_TTL_MS = 10 * 60_000;

/**
 * Raises each quota counter to what the ledger says was spent. The counter falls behind
 * when a charge was lost (Redis away after the gate read it); it is never lowered, because
 * it is legitimately ahead while ledger rows wait in the spool.
 *
 * Runs on one instance at a time, once per interval (a day by default).
 */
@Injectable()
export class QuotaReconciler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuotaReconciler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(QUOTA_COUNTER) private readonly counter: IQuotaCounter,
    @Inject(LEDGER_USAGE_READER) private readonly usage: ILedgerUsageReader,
    @Inject(QUOTA_RECONCILE_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass; null when another instance holds the lock. Returns how many counters were raised. */
  async reconcileOnce(now = new Date()): Promise<{ checked: number; raised: number } | null> {
    const lock = await this.counter.tryLock('reconcile', LOCK_TTL_MS);
    if (!lock) return null;
    try {
      let checked = 0;
      let raised = 0;
      for await (const { key, value } of this.counter.list()) {
        checked++;
        // Up to now, not the period's end: nothing is spent in the future.
        const to = now < key.periodEnd ? now : key.periodEnd;
        const spent = await this.usage.microCreditsSpent(key.payer, key.capability, key.periodStart, to);
        if (spent > value) {
          await this.counter.raiseTo(key, spent);
          raised++;
          this.logger.warn({ key, counter: value.toString(), ledger: spent.toString() }, 'Quota counter was behind the ledger');
        }
      }
      return { checked, raised };
    } finally {
      await lock.release();
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.reconcileOnce();
      if (result) this.logger.log(result, 'Quota counters reconciled with the ledger');
    } catch (err) {
      this.logger.warn(`Quota reconcile failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
