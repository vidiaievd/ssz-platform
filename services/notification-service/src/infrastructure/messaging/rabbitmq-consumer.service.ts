import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';
import { RABBITMQ_HANDLERS, type IMessageHandler, type MessageMeta } from './message-handler.interface.js';

const QUEUE_NAME = 'notification-service';
const DLX_NAME = 'ssz.events.dlx';

@Injectable()
export class RabbitmqConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqConsumerService.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;
  private readonly exchangeName: string;
  private readonly handlerMap = new Map<string, IMessageHandler>();

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    @Optional() @Inject(RABBITMQ_HANDLERS) handlers: IMessageHandler[] = [],
  ) {
    this.exchangeName = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.exchange ?? 'ssz.events';
    for (const handler of handlers) {
      this.handlerMap.set(handler.routingKey, handler);
    }
  }

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;

    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — consumer is disabled');
      return;
    }

    if (this.handlerMap.size === 0) {
      this.logger.debug('No message handlers registered — consumer queue will not be created');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    const routingKeys = [...this.handlerMap.keys()];

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(DLX_NAME, 'fanout', { durable: true });
        await channel.assertQueue(`${QUEUE_NAME}.dead-letters`, { durable: true });
        await channel.bindQueue(`${QUEUE_NAME}.dead-letters`, DLX_NAME, '');

        await channel.assertQueue(QUEUE_NAME, {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': DLX_NAME,
            'x-message-ttl': 86_400_000,
          },
        });

        for (const key of routingKeys) {
          await channel.bindQueue(QUEUE_NAME, this.exchangeName, key);
          this.logger.log(`Bound queue "${QUEUE_NAME}" to exchange with key "${key}"`);
        }

        await channel.consume(QUEUE_NAME, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`Consumer listening on queue "${QUEUE_NAME}" (${routingKeys.length} routing keys)`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: {
      eventId?: string;
      eventType?: string;
      occurredAt?: string;
      source?: string;
      correlationId?: string;
      payload?: unknown;
    };

    try {
      envelope = JSON.parse(msg.content.toString()) as typeof envelope;
    } catch {
      this.logger.error('Received non-JSON message — dead-lettering');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, occurredAt, source, correlationId, payload } = envelope;

    if (!eventId || !eventType) {
      this.logger.warn('Message missing eventId or eventType — dead-lettering');
      channel.nack(msg, false, false);
      return;
    }

    const handler = this.handlerMap.get(msg.fields.routingKey);
    if (!handler) {
      this.logger.warn(`No handler for routing key "${msg.fields.routingKey}" — acking`);
      channel.ack(msg);
      return;
    }

    const alreadyProcessed = await this.prisma.processedEvent
      .findUnique({ where: { eventId } })
      .then((r) => !!r)
      .catch(() => false);

    if (alreadyProcessed) {
      this.logger.debug(`Duplicate event "${eventType}" [${eventId}] — acking`);
      channel.ack(msg);
      return;
    }

    try {
      const meta: MessageMeta = {
        eventId,
        eventType,
        occurredAt: occurredAt ?? new Date().toISOString(),
        source: source ?? 'unknown',
        correlationId,
      };

      await handler.handle(payload, meta);

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });

      channel.ack(msg);
      this.logger.debug(`Processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `Handler failed for "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'dead-lettering' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
