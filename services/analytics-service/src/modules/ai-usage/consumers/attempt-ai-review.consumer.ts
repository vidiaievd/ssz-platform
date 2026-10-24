import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { isFoldableAiReview, isFoldableDispute } from '../domain/draft-quality.js';

const PROCESSOR_ID = 'ai-review-quality-daily';
const QUEUE = 'analytics-service.ai-review-quality.attempt-ai-review';
const EXCHANGE = EXCHANGES.EXERCISE_ENGINE;
const REVIEWED = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_AI_REVIEWED;
const DISPUTED = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_AI_REVIEW_DISPUTED;

/** One increment of `ai_draft_quality_daily`: which row, and which counter. */
interface Fold {
  day: string;
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  column: 'reviews' | 'disputes';
}

/**
 * Folds models' reviews of learners nobody reviews into `ai_draft_quality_daily` beside the
 * teachers' drafts — plan 79, step 2.3b: each delivered verdict adds a review, each "this
 * review is wrong" a dispute, on the review's day so the two stay a rate.
 *
 * One queue for both events: a dispute can only follow its review, but a dispute folded
 * first still lands — it opens the row with no reviews, and the review adds to it. Marker and
 * increment share a transaction and the channel takes one message at a time, as in the other
 * folds (memory `rabbitmq-consumer-no-prefetch`).
 */
@Injectable()
export class AttemptAiReviewConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttemptAiReviewConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AttemptAiReviewConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AttemptAiReviewConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AttemptAiReviewConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, REVIEWED);
        await channel.bindQueue(QUEUE, EXCHANGE, DISPUTED);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AttemptAiReviewConsumer listening on queue "${QUEUE}"`);
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
    // Dispatched on the routing key: the envelope's own type is not to be relied on across
    // publishers (memory `auth-envelope-event-type-is-csharp-name`).
    const fold = foldOf(msg.fields.routingKey, envelope.payload);
    if (!eventId || fold === null) {
      this.logger.warn(`AttemptAiReviewConsumer: discarding malformed "${msg.fields.routingKey}" [${eventId}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const folded = await this.fold(eventId, eventType ?? msg.fields.routingKey, fold);
      channel.ack(msg);
      this.logger.debug(`AttemptAiReviewConsumer: ${folded ? 'folded' : 'already folded'} [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AttemptAiReviewConsumer: failed [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was folded before. */
  private async fold(eventId: string, eventType: string, f: Fold): Promise<boolean> {
    const reviews = f.column === 'reviews' ? 1 : 0;
    const disputes = f.column === 'disputes' ? 1 : 0;

    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId, processorId: PROCESSOR_ID, eventType }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      await tx.$executeRaw`
        INSERT INTO ai_draft_quality_daily (
          id, day, capability, model_id, prompt_version, reviews,
          remarks_accepted, remarks_edited, remarks_discarded, remarks_untouched,
          disputes, updated_at
        ) VALUES (
          gen_random_uuid()::text, ${f.day}::date, ${f.capability}, ${f.modelId}, ${f.promptVersion}, ${reviews},
          0, 0, 0, 0,
          ${disputes}, now()
        )
        ON CONFLICT (day, capability, model_id, prompt_version)
        DO UPDATE SET
          reviews    = ai_draft_quality_daily.reviews + EXCLUDED.reviews,
          disputes   = ai_draft_quality_daily.disputes + EXCLUDED.disputes,
          updated_at = now()
      `;
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

/** Which counter an event adds to, on which row — or null for one this fold cannot read. */
export function foldOf(routingKey: string, payload: unknown): Fold | null {
  if (routingKey === REVIEWED && isFoldableAiReview(payload)) {
    return { ...axes(payload), day: payload.occurredAt.slice(0, 10), column: 'reviews' };
  }
  if (routingKey === DISPUTED && isFoldableDispute(payload)) {
    return { ...axes(payload), day: new Date(payload.reviewedAt).toISOString().slice(0, 10), column: 'disputes' };
  }
  return null;
}

function axes(p: { capability: string; modelId: string | null; promptVersion: string | null }) {
  return { capability: p.capability, modelId: p.modelId, promptVersion: p.promptVersion };
}
