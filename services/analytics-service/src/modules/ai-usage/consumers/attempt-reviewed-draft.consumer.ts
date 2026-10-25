import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';
import type { BaseEvent, ExerciseAttemptReviewedPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { reviewedIncrements } from '../domain/draft-quality.js';
import type { ReviewedIncrement } from '../domain/draft-quality.js';

const PROCESSOR_ID = 'ai-draft-quality-daily';
const QUEUE = 'analytics-service.ai-draft-quality.attempt-reviewed';
const EXCHANGE = EXCHANGES.EXERCISE_ENGINE;
const BINDING_KEY = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_REVIEWED;

/**
 * Folds what teachers did with models' review drafts into `ai_draft_quality_daily` — plan
 * 79, step 1.5; suggested rubric marks against the teacher's — step 1.7d; teachers' verdicts
 * after a model's at a school that lets one answer first, and how many went the other way —
 * plan 80, step 6c (`reviewedIncrements`).
 *
 * Every verdict arrives here; only those with a draft on screen (`aiDraft`) or a model's
 * verdict before them (`aiVerdict`) are folded, the rest are acked as nothing to count. Marker and increment share a transaction
 * and the channel takes one message at a time, as in the AI usage fold (memory
 * `rabbitmq-consumer-no-prefetch`). The day is the verdict's (`occurredAt`, UTC).
 */
@Injectable()
export class AttemptReviewedDraftConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttemptReviewedDraftConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AttemptReviewedDraftConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AttemptReviewedDraftConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AttemptReviewedDraftConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AttemptReviewedDraftConsumer listening on queue "${QUEUE}"`);
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
    const payload = envelope.payload as Partial<ExerciseAttemptReviewedPayload> | undefined;
    const increments = reviewedIncrements(payload);
    // No model in it — the common case, and nothing to count.
    if (increments !== null && increments.length === 0) {
      channel.ack(msg);
      return;
    }
    const occurredAt = payload?.occurredAt;
    if (!eventId || !eventType || increments === null || !isDay(occurredAt)) {
      this.logger.warn(`AttemptReviewedDraftConsumer: discarding malformed "${eventType}" [${eventId}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const folded = await this.fold(eventId, eventType, occurredAt, increments);
      channel.ack(msg);
      this.logger.debug(
        `AttemptReviewedDraftConsumer: ${folded ? 'folded' : 'already folded'} [${eventId}]`,
      );
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AttemptReviewedDraftConsumer: failed [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was folded before. */
  private async fold(
    eventId: string,
    eventType: string,
    occurredAt: string,
    increments: ReviewedIncrement[],
  ): Promise<boolean> {
    const day = new Date(occurredAt).toISOString().slice(0, 10);

    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId, processorId: PROCESSOR_ID, eventType }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      for (const i of increments) {
        await tx.$executeRaw`
          INSERT INTO ai_draft_quality_daily (
            id, day, capability, model_id, prompt_version, reviews,
            remarks_accepted, remarks_edited, remarks_discarded, remarks_untouched,
            reviews_with_marks, marks_same, marks_different, marks_compared,
            marks_delta_sum, marks_abs_delta_sum,
            teacher_verdicts, teacher_overturned, updated_at
          ) VALUES (
            gen_random_uuid()::text, ${day}::date, ${i.capability}, ${i.modelId}, ${i.promptVersion}, ${i.reviews},
            ${i.remarks.accepted}, ${i.remarks.edited}, ${i.remarks.discarded}, ${i.remarks.untouched},
            ${i.marks.reviews}, ${i.marks.same}, ${i.marks.different}, ${i.marks.compared},
            ${i.marks.deltaSum}, ${i.marks.absDeltaSum},
            ${i.teacherVerdicts}, ${i.teacherOverturned}, now()
          )
          ON CONFLICT (day, capability, model_id, prompt_version)
          DO UPDATE SET
            reviews           = ai_draft_quality_daily.reviews + EXCLUDED.reviews,
            remarks_accepted  = ai_draft_quality_daily.remarks_accepted + EXCLUDED.remarks_accepted,
            remarks_edited    = ai_draft_quality_daily.remarks_edited + EXCLUDED.remarks_edited,
            remarks_discarded = ai_draft_quality_daily.remarks_discarded + EXCLUDED.remarks_discarded,
            remarks_untouched = ai_draft_quality_daily.remarks_untouched + EXCLUDED.remarks_untouched,
            reviews_with_marks  = ai_draft_quality_daily.reviews_with_marks + EXCLUDED.reviews_with_marks,
            marks_same          = ai_draft_quality_daily.marks_same + EXCLUDED.marks_same,
            marks_different     = ai_draft_quality_daily.marks_different + EXCLUDED.marks_different,
            marks_compared      = ai_draft_quality_daily.marks_compared + EXCLUDED.marks_compared,
            marks_delta_sum     = ai_draft_quality_daily.marks_delta_sum + EXCLUDED.marks_delta_sum,
            marks_abs_delta_sum = ai_draft_quality_daily.marks_abs_delta_sum + EXCLUDED.marks_abs_delta_sum,
            teacher_verdicts    = ai_draft_quality_daily.teacher_verdicts + EXCLUDED.teacher_verdicts,
            teacher_overturned  = ai_draft_quality_daily.teacher_overturned + EXCLUDED.teacher_overturned,
            updated_at        = now()
        `;
      }
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
