import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AI_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { isFoldableAssistFeedback } from '../domain/assist-quality.js';

const PROCESSOR_ID = 'ai-assist-quality-daily';
const QUEUE = 'analytics-service.ai-assist-quality.assist-feedback';
const EXCHANGE = EXCHANGES.AI;
const BINDING_KEY = AI_EVENT_TYPES.ASSIST_FEEDBACK;

/** One increment of `ai_assist_quality_daily`: which row, and which counters. */
export interface AssistFold {
  day: string;
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  helpful: boolean;
  reasonGiven: boolean;
}

/**
 * Folds learners' marks on the assistant's answers into `ai_assist_quality_daily` — plan 83,
 * step 7. Counted on the answer's day, not the mark's, so a prompt version's marks stay with
 * the days it answered. Marker and increment share a transaction and the channel takes one
 * message at a time, as in the other folds (memory `rabbitmq-consumer-no-prefetch`).
 */
@Injectable()
export class AssistFeedbackConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistFeedbackConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AssistFeedbackConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AssistFeedbackConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AssistFeedbackConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AssistFeedbackConsumer listening on queue "${QUEUE}"`);
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
    const fold = assistFoldOf(envelope.payload);
    if (!eventId || fold === null) {
      this.logger.warn(`AssistFeedbackConsumer: discarding malformed "${msg.fields.routingKey}" [${eventId}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const folded = await this.fold(eventId, eventType ?? msg.fields.routingKey, fold);
      channel.ack(msg);
      this.logger.debug(`AssistFeedbackConsumer: ${folded ? 'folded' : 'already folded'} [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AssistFeedbackConsumer: failed [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was folded before. */
  private async fold(eventId: string, eventType: string, f: AssistFold): Promise<boolean> {
    const helpful = f.helpful ? 1 : 0;
    const notHelpful = f.helpful ? 0 : 1;
    const withReason = f.reasonGiven ? 1 : 0;

    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId, processorId: PROCESSOR_ID, eventType }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      await tx.$executeRaw`
        INSERT INTO ai_assist_quality_daily (
          id, day, capability, model_id, prompt_version, helpful, not_helpful, with_reason, updated_at
        ) VALUES (
          gen_random_uuid()::text, ${f.day}::date, ${f.capability}, ${f.modelId}, ${f.promptVersion},
          ${helpful}, ${notHelpful}, ${withReason}, now()
        )
        ON CONFLICT (day, capability, model_id, prompt_version)
        DO UPDATE SET
          helpful     = ai_assist_quality_daily.helpful + EXCLUDED.helpful,
          not_helpful = ai_assist_quality_daily.not_helpful + EXCLUDED.not_helpful,
          with_reason = ai_assist_quality_daily.with_reason + EXCLUDED.with_reason,
          updated_at  = now()
      `;
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

/** The row and counters a mark adds to — or null for a payload this fold cannot read. */
export function assistFoldOf(payload: unknown): AssistFold | null {
  if (!isFoldableAssistFeedback(payload)) return null;
  return {
    day: new Date(payload.answeredAt).toISOString().slice(0, 10),
    capability: payload.capability,
    modelId: payload.modelId,
    promptVersion: payload.promptVersion,
    helpful: payload.helpful,
    reasonGiven: payload.reasonGiven,
  };
}
