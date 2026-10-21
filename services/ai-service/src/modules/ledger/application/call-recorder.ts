import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { LlmUsage } from '../../providers/domain/llm-result.js';
import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import { costMicros } from '../../registry/domain/cost.js';
import type { AiCallOutcome, AiCallRecord, CallAttempt, CallContext } from '../domain/ai-call.js';
import { creditsFor } from '../domain/credits.js';
import { AI_CALL_LEDGER, LedgerRecordRejected, type IAiCallLedger } from './ports/ai-call.ledger.js';
import { LEDGER_SPOOL, type ILedgerSpool } from './ports/ledger-spool.js';

/** Credits per one USD — the platform rate, one for every agent (AI_CREDITS_PER_USD). */
export const CREDIT_RATE = Symbol('CREDIT_RATE');

/** Pauses before the second and third ledger attempts; overridable for tests. */
export const LEDGER_RETRY_DELAYS_MS = Symbol('LEDGER_RETRY_DELAYS_MS');
const DEFAULT_RETRY_DELAYS_MS = [50, 200];

/** The rate is per USD: a price in any other currency gets no credits until it has its own. */
const CREDIT_CURRENCY = 'USD';

export interface CallToRecord {
  capability: string;
  context: CallContext;
  /** The model that answered or failed last; null when none was called. */
  model: ModelForCall | null;
  promptVersion: string | null;
  /** Null when no answer arrived (provider error, nothing called). */
  usage: LlmUsage | null;
  latencyMs: number;
  outcome: AiCallOutcome;
  errorCode: string | null;
  fallbackUsed: boolean;
  attempts: CallAttempt[];
  startedAt: Date;
}

export interface RecordedCall {
  callId: string;
  cost: { micros: number; currency: string } | null;
  credits: string | null;
}

/**
 * Prices a finished call at the price the router read for it, turns the cost into credits
 * and writes it to the ledger.
 *
 * A ledger write that fails is never thrown: by then the model has answered and the
 * provider has billed, and throwing would discard an answer that was paid for. Instead
 * (plan 77, step 8a): a few quick retries for a short blip, then the spool in Redis, which
 * `LedgerSpoolDrainer` moves into the database once it is back. Only when Redis is away
 * too is the row lost — logged whole, so it can still be put back by hand.
 */
@Injectable()
export class CallRecorder {
  private readonly logger = new Logger(CallRecorder.name);

  constructor(
    @Inject(AI_CALL_LEDGER) private readonly ledger: IAiCallLedger,
    @Inject(CREDIT_RATE) private readonly creditRate: string,
    @Inject(LEDGER_SPOOL) private readonly spool: ILedgerSpool,
    @Optional() @Inject(LEDGER_RETRY_DELAYS_MS) private readonly retryDelaysMs: number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {}

  async record(call: CallToRecord): Promise<RecordedCall> {
    const cost = this.cost(call);
    const credits = cost && cost.currency === CREDIT_CURRENCY ? creditsFor(cost.micros, this.creditRate) : null;
    if (call.usage && call.model && !call.model.currentPrice) {
      this.logger.warn(`Model ${call.model.model.id} (${call.model.model.providerModelId}) has no price — call recorded without cost`);
    }

    const record: AiCallRecord = {
      id: randomUUID(),
      capability: call.capability,
      context: call.context,
      model: call.model
        ? {
            providerId: call.model.provider.id,
            providerCode: call.model.provider.code,
            modelId: call.model.model.id,
            providerModelId: call.model.model.providerModelId,
          }
        : null,
      promptVersion: call.promptVersion,
      usage: call.usage,
      cost,
      credits,
      latencyMs: call.latencyMs,
      outcome: call.outcome,
      errorCode: call.errorCode,
      fallbackUsed: call.fallbackUsed,
      attempts: call.attempts,
      createdAt: call.startedAt,
    };

    await this.write(record);
    return { callId: record.id, cost, credits };
  }

  private async write(record: AiCallRecord): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryDelaysMs.length; attempt++) {
      if (attempt > 0) await sleep(this.retryDelaysMs[attempt - 1]);
      try {
        await this.ledger.record(record);
        return;
      } catch (err) {
        if (err instanceof LedgerRecordRejected) {
          // Neither a retry nor the spool can change the database's mind about this row.
          this.logger.error(`Ledger rejected ${describe(record)}: ${err.message} — row: ${JSON.stringify(record)}`);
          return;
        }
        lastError = err;
      }
    }

    try {
      await this.spool.push(record);
      this.logger.warn(`Ledger write failed for ${describe(record)}, spooled for later: ${String(lastError)}`);
    } catch (spoolError) {
      this.logger.error(
        `Ledger write failed for ${describe(record)} and the spool is unavailable — row lost: ` +
          `${String(lastError)}; spool: ${String(spoolError)} — row: ${JSON.stringify(record)}`,
      );
    }
  }

  /** No usage (nothing answered) costs nothing; usage without a price is an unknown cost. */
  private cost(call: CallToRecord): RecordedCall['cost'] {
    if (!call.usage) return { micros: 0, currency: call.model?.currentPrice?.currency ?? CREDIT_CURRENCY };
    const price = call.model?.currentPrice;
    if (!price) return null;
    return { micros: costMicros(call.usage, price), currency: price.currency };
  }
}

function describe(record: AiCallRecord): string {
  return `${record.capability} call ${record.id} (${record.outcome})`;
}
