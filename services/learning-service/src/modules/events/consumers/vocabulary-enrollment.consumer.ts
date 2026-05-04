import { Injectable, Inject, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { CONTENT_CLIENT, type IContentClient } from '../../../shared/application/ports/content-client.port.js';
import { BulkIntroduceFromVocabularyListCommand } from '../../srs/application/commands/bulk-introduce-from-vocabulary-list.command.js';
import type { EnrollmentCreatedPayload } from '@ssz/contracts';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

const QUEUE = 'learning-service.vocabulary-enrollment';
const ROUTING_KEY = 'learning.enrollment.created';

@Injectable()
export class VocabularyEnrollmentConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VocabularyEnrollmentConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  onModuleInit(): void {
    const rabbitmqCfg = this.config.get<AppConfig['rabbitmq']>('rabbitmq');
    const url = rabbitmqCfg?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — VocabularyEnrollmentConsumer disabled');
      return;
    }
    const exchange = rabbitmqCfg?.exchange ?? 'ssz.events';

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, exchange, ROUTING_KEY);
        await channel.prefetch(5);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${ROUTING_KEY}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('Malformed message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, payload } = envelope;

    try {
      const existing = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (existing) {
        this.logger.debug(`Duplicate event ${eventId} — skipping`);
        channel.ack(msg);
        return;
      }

      const p = payload as EnrollmentCreatedPayload;

      // Check if the enrolled container is a vocabulary list with auto_add_to_srs.
      // The Content Service returns 404 for non-vocabulary-list IDs — we treat that as a
      // silent skip. Any other error is logged as a warning but does not block enrollment.
      const srsResult = await this.contentClient.getVocabularyListAutoAddToSrs(p.containerId);

      if (srsResult.isOk && srsResult.value === true) {
        const bulkResult = await this.commandBus.execute(
          new BulkIntroduceFromVocabularyListCommand(p.userId, p.containerId),
        );
        if (bulkResult.isFail) {
          this.logger.warn(
            `BulkIntroduce failed for enrollment ${p.enrollmentId}: ${bulkResult.error?.message}`,
          );
        } else {
          this.logger.log(
            `SRS bulk-introduce for user ${p.userId}, list ${p.containerId}: ` +
            `introduced=${bulkResult.value.introduced}, skipped=${bulkResult.value.skipped}`,
          );
        }
      } else if (srsResult.isOk && srsResult.value === false) {
        this.logger.debug(
          `Vocabulary list ${p.containerId} has autoAddToSrs=false — skipping SRS introduction`,
        );
      }
      // If srsResult.isFail, the container is not a vocabulary list (404) or Content Service
      // is unavailable. Either way, no SRS cards are introduced. No nack — enrollment proceeds.

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
