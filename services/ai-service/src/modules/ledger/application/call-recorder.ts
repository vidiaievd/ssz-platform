import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { LlmUsage } from '../../providers/domain/llm-result.js';
import type { ModelForCall } from '../../registry/application/ports/registry.reader.js';
import { costMicros } from '../../registry/domain/cost.js';
import type { AiCallOutcome, AiCallRecord, CallAttempt, CallContext } from '../domain/ai-call.js';
import { creditsFor } from '../domain/credits.js';
import { AI_CALL_LEDGER, type IAiCallLedger } from './ports/ai-call.ledger.js';

/** Credits per one USD — the platform rate, one for every agent (AI_CREDITS_PER_USD). */
export const CREDIT_RATE = Symbol('CREDIT_RATE');

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
 * A ledger write that fails is logged, not thrown: by then the model has answered and the
 * provider has billed, and throwing would discard an answer that was paid for. The lost row
 * is the smaller harm — and loud in the error log.
 */
@Injectable()
export class CallRecorder {
  private readonly logger = new Logger(CallRecorder.name);

  constructor(
    @Inject(AI_CALL_LEDGER) private readonly ledger: IAiCallLedger,
    @Inject(CREDIT_RATE) private readonly creditRate: string,
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

    try {
      await this.ledger.record(record);
    } catch (err) {
      this.logger.error(`Ledger write failed for ${call.capability} call ${record.id} (${call.outcome}): ${String(err)}`);
    }
    return { callId: record.id, cost, credits };
  }

  /** No usage (nothing answered) costs nothing; usage without a price is an unknown cost. */
  private cost(call: CallToRecord): RecordedCall['cost'] {
    if (!call.usage) return { micros: 0, currency: call.model?.currentPrice?.currency ?? CREDIT_CURRENCY };
    const price = call.model?.currentPrice;
    if (!price) return null;
    return { micros: costMicros(call.usage, price), currency: price.currency };
  }
}
