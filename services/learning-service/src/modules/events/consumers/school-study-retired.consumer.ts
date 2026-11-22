import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { CONTENT_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { RedisDueQueueService } from '../../srs/infrastructure/cache/redis-due-queue.service.js';

const QUEUE = 'learning-service.school-study-retired';
const ROUTING_KEY = CONTENT_EVENT_TYPES.SCHOOL_STUDY_RETIRED;

interface EventEnvelope {
  eventId?: string;
  payload?: { schoolId?: unknown; exerciseIds?: unknown; vocabularyItemIds?: unknown };
}

function stringList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.length > 0))
    return null;
  return value as string[];
}

/**
 * Plan 90, Q11: a purged school's exercises (deleted, or kept read only in an `obsolete` course) and
 * the words of its deleted lists leave learners' review queues. content sends the ids in chunks
 * before it deletes anything (`content.school.study_retired`).
 *
 * Cards on them — exercise, gap (`<exerciseId>#<gapKey>`) and word cards — become `SUSPENDED`.
 * **The history stays**: the FSRS state, reps and lapses are kept, the cards just stop coming due
 * (a start would answer 404 or 409 `SCHOOL_NOT_ACTIVE`). Written straight to the table, with no
 * `srs.card.suspended` event per card — no learner chose this. The users' cached due queues are
 * dropped after the commit. Cards the school's closing paused (`study_paused`) lose that mark, so
 * nothing brings them back. Idempotent by its filter and by `processed_events`.
 */
@Injectable()
export class SchoolStudyRetiredConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolStudyRetiredConsumer.name);
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
      this.logger.warn('RABBITMQ_URL not configured — SchoolStudyRetiredConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolStudyRetiredConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SchoolStudyRetiredConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.CONTENT, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.CONTENT, ROUTING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`SchoolStudyRetiredConsumer listening on "${QUEUE}"`);
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
    const exerciseIds = stringList(envelope.payload?.exerciseIds);
    const wordIds = stringList(envelope.payload?.vocabularyItemIds);
    if (
      !eventId ||
      typeof schoolId !== 'string' ||
      schoolId.length === 0 ||
      !exerciseIds ||
      !wordIds
    ) {
      this.logger.error(`${ROUTING_KEY} [${String(eventId)}] is malformed — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.prisma.processedEvent.findUnique({ where: { eventId } })) {
        channel.ack(msg);
        return;
      }

      const users = await this.prisma.$transaction(async (tx) => {
        const rows =
          exerciseIds.length + wordIds.length === 0
            ? []
            : await tx.$queryRaw<Array<{ user_id: string }>>`
                UPDATE srs_review_cards
                   SET state = 'suspended', updated_at = now()
                 WHERE state <> 'suspended'
                   AND (   (content_type = 'exercise' AND content_id = ANY(${exerciseIds}::text[]))
                        OR (content_type = 'exercise_gap'
                            AND split_part(content_id, '#', 1) = ANY(${exerciseIds}::text[]))
                        OR (content_type = 'vocabulary_word' AND content_id = ANY(${wordIds}::text[])))
             RETURNING user_id`;
        // Cards a closed school paused stay suspended for good: no restore follows a purge.
        await tx.$executeRaw`
          UPDATE srs_review_cards
             SET paused_by_school_id = NULL, state_before_pause = NULL
           WHERE paused_by_school_id = ${schoolId}`;
        await tx.processedEvent.create({ data: { eventId, eventType: ROUTING_KEY } });
        return rows;
      });

      const userIds = [...new Set(users.map((r) => r.user_id))];
      for (const userId of userIds) await this.dueQueue.invalidate(userId);
      this.logger.log(
        `School ${schoolId} study retired: ${users.length} card(s) of ${userIds.length} learner(s) suspended ` +
          `(${exerciseIds.length} exercise(s), ${wordIds.length} word(s) asked)`,
      );
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${ROUTING_KEY} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields?.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
