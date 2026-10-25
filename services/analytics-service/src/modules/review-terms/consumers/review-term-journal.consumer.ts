import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { journalEntryOf } from '../domain/journal-entry.js';
import type { JournalEntry } from '../domain/journal-entry.js';

const PROCESSOR_ID = 'review-term-journal';
const QUEUE = 'analytics-service.review-terms.attempt';
const EXCHANGE = EXCHANGES.EXERCISE_ENGINE;
const AI_REVIEWED = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_AI_REVIEWED;
const REVIEWED = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_REVIEWED;

/**
 * Keeps the journal of school work closed by a model's verdict at the school's term —
 * plan 80, step 6a (R4): one row per attempt in `review_term_acceptances`, and the teacher's
 * verdict on it afterwards, if one came.
 *
 * One queue for both events. The revision can only follow the acceptance, but a requeue may
 * swap them, so each event writes its own columns of the same row and neither waits for the
 * other. Marker and write share a transaction and the channel takes one message at a time,
 * as in the other folds (memory `rabbitmq-consumer-no-prefetch`).
 */
@Injectable()
export class ReviewTermJournalConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewTermJournalConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ReviewTermJournalConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('ReviewTermJournalConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`ReviewTermJournalConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, AI_REVIEWED);
        await channel.bindQueue(QUEUE, EXCHANGE, REVIEWED);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`ReviewTermJournalConsumer listening on queue "${QUEUE}"`);
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
    const entry = journalEntryOf(msg.fields.routingKey, envelope.payload);
    // Most verdicts are neither — nothing to write.
    if (entry === 'skip') {
      channel.ack(msg);
      return;
    }
    if (!eventId || entry === null) {
      this.logger.warn(`ReviewTermJournalConsumer: discarding malformed "${msg.fields.routingKey}" [${eventId}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const written = await this.write(eventId, eventType ?? msg.fields.routingKey, entry);
      channel.ack(msg);
      this.logger.debug(`ReviewTermJournalConsumer: ${written ? entry.kind : 'already written'} [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `ReviewTermJournalConsumer: failed [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was written before. */
  private async write(eventId: string, eventType: string, entry: JournalEntry): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId, processorId: PROCESSOR_ID, eventType }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      // Each event carries what the work is, so whichever lands first opens the row; past
      // that it only ever writes its own columns.
      const { kind: _kind, attemptId, ...columns } = entry;
      await tx.reviewTermAcceptance.upsert({
        where: { attemptId },
        create: { attemptId, ...columns },
        update: columns,
      });
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
