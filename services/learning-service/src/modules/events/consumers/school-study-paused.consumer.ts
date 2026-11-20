import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CONTENT_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { RedisDueQueueService } from '../../srs/infrastructure/cache/redis-due-queue.service.js';

const QUEUE = 'learning-service.school-study-paused';
const PAUSED = CONTENT_EVENT_TYPES.SCHOOL_STUDY_PAUSED;
const RESUMED = CONTENT_EVENT_TYPES.SCHOOL_STUDY_RESUMED;

interface EventEnvelope {
  eventId?: string;
  payload?: { schoolId?: unknown; exerciseIds?: unknown };
}

function stringList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.length > 0))
    return null;
  return value as string[];
}

/**
 * Plan 90, live check step 7: a closed school's exercises leave learners' review queues — the
 * engine refuses to start them (409 `SCHOOL_NOT_ACTIVE`) — and come back if it is restored.
 *
 * `content.school.study_paused { schoolId, exerciseIds }` (chunks): exercise and gap cards on those
 * ids that are not already suspended become `SUSPENDED`, marked with the school and the state they
 * had. A card the learner suspended is left alone, so the restore never wakes it.
 *
 * `content.school.study_resumed { schoolId }`: every card still marked with the school goes back to
 * its state. `dueAt` and the FSRS fields are never touched, so an overdue card is simply due.
 *
 * Both come from content on one queue, in the order content handled `closed` / `restored`. A purge
 * (`study_retired`) clears the mark: nothing brings those cards back. Written straight to the table
 * with no per-card event, as the purge does — no learner chose this. Idempotent by its filters and by
 * `processed_events`.
 */
@Injectable()
export class SchoolStudyPausedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolStudyPausedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    private readonly dueQueue: RedisDueQueueService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolStudyPausedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolStudyPausedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SchoolStudyPausedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.CONTENT, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.CONTENT, PAUSED);
        await channel.bindQueue(QUEUE, EXCHANGES.CONTENT, RESUMED);
        // One at a time: a resume must not overtake the pause it undoes.
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`SchoolStudyPausedConsumer listening on "${QUEUE}"`);
      },
    });
    // Without a listener an 'error' from the channel (a setup failing while the broker
    // restarts) is an unhandled event and takes the whole process down.
    this.channelWrapper.on('error', (err: unknown) =>
      this.logger.error(`RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  async handleMessage(
    channel: Pick<ConfirmChannel, 'ack' | 'nack'>,
    msg: ConsumeMessage,
  ): Promise<void> {
    const eventType = msg.fields?.routingKey;
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('Malformed message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId } = envelope;
    const schoolId = envelope.payload?.schoolId;
    const exerciseIds = eventType === PAUSED ? stringList(envelope.payload?.exerciseIds) : [];
    if (
      !eventId ||
      (eventType !== PAUSED && eventType !== RESUMED) ||
      typeof schoolId !== 'string' ||
      schoolId.length === 0 ||
      !exerciseIds
    ) {
      this.logger.error(`${String(eventType)} [${String(eventId)}] is malformed — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.prisma.processedEvent.findUnique({ where: { eventId } })) {
        channel.ack(msg);
        return;
      }

      const rows = await this.prisma.$transaction(async (tx) => {
        let changed: Array<{ user_id: string }> = [];
        if (eventType === RESUMED) {
          changed = await tx.$queryRaw<Array<{ user_id: string }>>`
            UPDATE srs_review_cards
               SET state = COALESCE(state_before_pause, 'review'::srs_card_state),
                   paused_by_school_id = NULL,
                   state_before_pause = NULL,
                   updated_at = now()
             WHERE paused_by_school_id = ${schoolId}
               AND state = 'suspended'
            RETURNING user_id`;
        } else if (exerciseIds.length > 0) {
          // `state_before_pause = state` reads the row as it was before this UPDATE.
          changed = await tx.$queryRaw<Array<{ user_id: string }>>`
            UPDATE srs_review_cards
               SET state_before_pause = state,
                   state = 'suspended',
                   paused_by_school_id = ${schoolId},
                   updated_at = now()
             WHERE state <> 'suspended'
               AND (   (content_type = 'exercise' AND content_id = ANY(${exerciseIds}::text[]))
                    OR (content_type = 'exercise_gap'
                        AND split_part(content_id, '#', 1) = ANY(${exerciseIds}::text[])))
            RETURNING user_id`;
        }
        await tx.processedEvent.create({ data: { eventId, eventType } });
        return changed;
      });

      const userIds = [...new Set(rows.map((r) => r.user_id))];
      for (const userId of userIds) await this.dueQueue.invalidate(userId);
      this.logger.log(
        eventType === PAUSED
          ? `School ${schoolId} closed: ${rows.length} card(s) of ${userIds.length} learner(s) paused ` +
              `(${exerciseIds.length} exercise(s) asked)`
          : `School ${schoolId} restored: ${rows.length} card(s) of ${userIds.length} learner(s) resumed`,
      );
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields?.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
