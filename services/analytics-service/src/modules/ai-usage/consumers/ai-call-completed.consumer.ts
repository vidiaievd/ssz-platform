import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AI_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { AiCallCompletedPayload, BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { latencyBucket, singleCallHistogram } from '../domain/latency-histogram.js';

const PROCESSOR_ID = 'ai-usage-daily';
const QUEUE = 'analytics-service.ai-usage.call-completed';
const EXCHANGE = EXCHANGES.AI;
const BINDING_KEY = AI_EVENT_TYPES.CALL_COMPLETED;

const CREDITS_PATTERN = /^\d{1,12}(\.\d{1,6})?$/;

/**
 * Folds every ai-service gateway call into `ai_usage_daily` — plan 77, step 10.
 *
 * The fold is one atomic upsert, so concurrent handlers could not lose an increment even
 * without `prefetch(1)`; it is set anyway because the marker in `processed_events` and the
 * increment share one transaction, and a counting projection is exactly where a parallel
 * batch has gone wrong before (memory `rabbitmq-consumer-no-prefetch`).
 *
 * The day is the call's own start (`createdAt`, UTC), not the envelope's time: a call
 * that waited in ai-service's ledger spool is still counted on the day it was made.
 */
@Injectable()
export class AiCallCompletedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiCallCompletedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AiCallCompletedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AiCallCompletedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AiCallCompletedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AiCallCompletedConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    const payload = envelope.payload as AiCallCompletedPayload | undefined;
    if (!eventId || !eventType || !isFoldable(payload)) {
      this.logger.warn(`AiCallCompletedConsumer: discarding malformed "${eventType}" [${eventId}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const folded = await this.fold(eventId, eventType, payload);
      channel.ack(msg);
      this.logger.debug(
        `AiCallCompletedConsumer: ${folded ? 'folded' : 'already folded'} [${eventId}]`,
      );
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AiCallCompletedConsumer: failed [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was folded before. */
  private async fold(eventId: string, eventType: string, p: AiCallCompletedPayload): Promise<boolean> {
    const day = new Date(p.createdAt).toISOString().slice(0, 10);
    const usage = p.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const latencyMs = Math.max(0, Math.round(p.latencyMs));
    // Postgres arrays are 1-based.
    const bucket = latencyBucket(latencyMs) + 1;
    const credits = p.credits ?? '0';

    return this.prisma.$transaction(async (tx) => {
      // The marker goes first and in the same transaction: a duplicate stops here, and a
      // failed increment rolls the marker back with it.
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId, processorId: PROCESSOR_ID, eventType }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      await tx.$executeRaw`
        INSERT INTO ai_usage_daily (
          id, day, capability, provider_code, provider_model_id, payer_type, payer_id, outcome,
          calls, fallback_calls, unpriced_calls,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, credits,
          latency_sum_ms, latency_min_ms, latency_max_ms, latency_buckets, updated_at
        ) VALUES (
          gen_random_uuid()::text, ${day}::date, ${p.capability}, ${p.providerCode}, ${p.providerModelId},
          ${p.payerType}, ${p.payerId}, ${p.outcome},
          1, ${p.fallbackUsed ? 1 : 0}, ${p.credits === null ? 1 : 0},
          ${usage.input}, ${usage.output}, ${usage.cacheRead}, ${usage.cacheWrite}, ${credits}::numeric,
          ${latencyMs}, ${latencyMs}, ${latencyMs}, ${singleCallHistogram(latencyMs)}::int[], now()
        )
        ON CONFLICT (day, capability, provider_code, provider_model_id, payer_type, payer_id, outcome)
        DO UPDATE SET
          calls              = ai_usage_daily.calls + 1,
          fallback_calls     = ai_usage_daily.fallback_calls + EXCLUDED.fallback_calls,
          unpriced_calls     = ai_usage_daily.unpriced_calls + EXCLUDED.unpriced_calls,
          input_tokens       = ai_usage_daily.input_tokens + EXCLUDED.input_tokens,
          output_tokens      = ai_usage_daily.output_tokens + EXCLUDED.output_tokens,
          cache_read_tokens  = ai_usage_daily.cache_read_tokens + EXCLUDED.cache_read_tokens,
          cache_write_tokens = ai_usage_daily.cache_write_tokens + EXCLUDED.cache_write_tokens,
          credits            = ai_usage_daily.credits + EXCLUDED.credits,
          latency_sum_ms     = ai_usage_daily.latency_sum_ms + EXCLUDED.latency_sum_ms,
          latency_min_ms     = LEAST(ai_usage_daily.latency_min_ms, EXCLUDED.latency_min_ms),
          latency_max_ms     = GREATEST(ai_usage_daily.latency_max_ms, EXCLUDED.latency_max_ms),
          latency_buckets[${bucket}::int] = ai_usage_daily.latency_buckets[${bucket}::int] + 1,
          updated_at         = now()
      `;
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

/** Only what the fold reads is checked; the rest of the payload is the ledger's business. */
function isFoldable(p: AiCallCompletedPayload | undefined): p is AiCallCompletedPayload {
  if (!p) return false;
  return (
    typeof p.capability === 'string' &&
    typeof p.payerType === 'string' &&
    typeof p.payerId === 'string' &&
    typeof p.outcome === 'string' &&
    typeof p.latencyMs === 'number' &&
    Number.isFinite(p.latencyMs) &&
    typeof p.createdAt === 'string' &&
    !Number.isNaN(Date.parse(p.createdAt)) &&
    (p.credits === null || (typeof p.credits === 'string' && CREDITS_PATTERN.test(p.credits)))
  );
}
