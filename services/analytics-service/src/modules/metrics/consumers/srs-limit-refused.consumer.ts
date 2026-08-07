import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, LEARNING_EVENT_TYPES } from '@ssz/contracts';
import type { BaseEvent, SrsLimitRefusedPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'srs-limit-refused';
const QUEUE = 'analytics-service.metrics.srs-limit-refused';
const EXCHANGE = EXCHANGES.LEARNING;
const BINDING_KEY = LEARNING_EVENT_TYPES.SRS_LIMIT_REFUSED;

/**
 * Records every time a daily SRS cap refused something (plan 37 §A.1).
 *
 * `attempt_evidence` only ever sees work that got through — a refusal produces no
 * rating, so it leaves that table untouched. The numbers 20 and 200 are a judgement
 * nobody has ever checked, and checking them is a question about exactly the cases
 * that are missing there. This consumer supplies them.
 *
 * Nothing about the material is stored: how often and to whom is the whole question.
 */
@Injectable()
export class SrsLimitRefusedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SrsLimitRefusedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SrsLimitRefusedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SrsLimitRefusedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SrsLimitRefusedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`SrsLimitRefusedConsumer listening on queue "${QUEUE}"`);
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

      await this.record(eventId, envelope.payload as SrsLimitRefusedPayload);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });
      channel.ack(msg);
      this.logger.debug(`SrsLimitRefusedConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `SrsLimitRefusedConsumer: failed "${eventType}" [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async record(eventId: string, p: SrsLimitRefusedPayload): Promise<void> {
    // Guarded by the unique eventId rather than upserted: a redelivery is the same
    // refusal arriving twice, and the second copy has nothing to update.
    await this.prisma.srsLimitRefusal.createMany({
      data: [
        {
          eventId,
          userId: p.userId,
          kind: p.kind,
          contentType: p.contentType,
          // The refusal's own timestamp, not the envelope's: the day boundary the cap
          // used is the one the counts have to be grouped by.
          occurredAt: new Date(p.occurredAt),
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
