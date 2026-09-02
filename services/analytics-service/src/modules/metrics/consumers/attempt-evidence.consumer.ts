import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, LEARNING_EVENT_TYPES } from '@ssz/contracts';
import type { AttemptRatedPayload, BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'attempt-evidence';
const QUEUE = 'analytics-service.metrics.attempt-evidence';
const EXCHANGE = EXCHANGES.LEARNING;
const BINDING_KEY = LEARNING_EVENT_TYPES.ATTEMPT_RATED;

/**
 * Records every attempt that moved an SRS card, with the *form* of the answer next
 * to the rating it produced (plan 36 §A.1).
 *
 * The ceilings the evidence scale puts on ratings are a judgement, not a
 * measurement, and the only way to later tell "the scale works" from "the scale
 * broke the schedule" is to hold rows from before the ceilings existed. So this
 * consumer ships ahead of the scale and writes `ratingApplied` unclamped.
 *
 * The learner's answer is never stored: correct-or-not is enough to calibrate.
 */
@Injectable()
export class AttemptEvidenceConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttemptEvidenceConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AttemptEvidenceConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AttemptEvidenceConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AttemptEvidenceConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AttemptEvidenceConsumer listening on queue "${QUEUE}"`);
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
    if (!eventId || !eventType) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({
        where: { eventId_processorId: { eventId, processorId: PROCESSOR_ID } },
      });
      if (alreadyProcessed) {
        channel.ack(msg);
        return;
      }

      await this.record(eventId, envelope.payload as AttemptRatedPayload, envelope.occurredAt);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });
      channel.ack(msg);
      this.logger.debug(`AttemptEvidenceConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AttemptEvidenceConsumer: failed "${eventType}" [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async record(
    eventId: string,
    p: AttemptRatedPayload,
    occurredAt: string,
  ): Promise<void> {
    const form = p.answerForm ?? null;

    // `create` guarded by the unique eventId rather than an upsert: a redelivery is
    // the same observation arriving twice, and the second one has nothing to update.
    await this.prisma.attemptEvidence.createMany({
      data: [
        {
          eventId,
          userId: p.userId,
          exerciseId: p.exerciseId,
          templateCode: p.templateCode ?? null,
          answerMode: form?.mode ?? null,
          bankSize: form?.bankSize ?? null,
          wordsConsumed: form?.wordsConsumed ?? null,
          score: Math.round(p.score),
          passed: p.passed ?? null,
          attemptOrdinal: p.attemptOrdinal,
          daysSinceLastReview: p.daysSinceLastReview ?? null,
          gapPosition: p.gapPosition ?? null,
          gapCount: p.gapCount ?? null,
          ratingApplied: p.ratingApplied,
          // `null` on the event becomes an empty column: the list is not nullable, and
          // "nobody said" and "said nothing counts" are both rows the profile skips.
          skills: p.skills ?? [],
          focus: p.focus ?? [],
          stabilityAfter: p.stabilityAfter ?? null,
          occurredAt: new Date(occurredAt),
        },
      ],
      skipDuplicates: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
