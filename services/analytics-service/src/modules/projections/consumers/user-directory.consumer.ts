import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'user-directory';
const QUEUE = 'analytics-service.projections.user-directory';
const EXCHANGE = EXCHANGES.PROFILE;

const BINDING_KEYS = ['profile.created', 'profile.updated'] as const;

// profile.* events arrive with the IDomainEvent as payload (profile-service uses
// BaseEvent<IDomainEvent> envelope where payload = the domain event object itself).
interface ProfileCreatedPayload {
  userId: string;
  displayName: string;
}

interface ProfileUpdatedPayload {
  userId: string;
  displayName?: string;
}

@Injectable()
export class UserDirectoryConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserDirectoryConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — UserDirectoryConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('UserDirectoryConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`UserDirectoryConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`UserDirectoryConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      this.logger.error('UserDirectoryConsumer: non-JSON message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    // profile-service uses old publisher format: timestamp instead of occurredAt
    const rawEnvelope = envelope as unknown as Record<string, unknown>;
    const eventId = (envelope.eventId ?? rawEnvelope['eventId']) as string;
    const eventType = envelope.eventType;
    if (!eventId || !eventType) {
      this.logger.warn('UserDirectoryConsumer: missing eventId/eventType — discarding');
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

      await this.applyEvent(eventType, envelope.payload as Record<string, unknown>);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });

      channel.ack(msg);
      this.logger.debug(`UserDirectoryConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `UserDirectoryConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'profile.created': {
        const p = payload as unknown as ProfileCreatedPayload;
        if (!p.userId || !p.displayName) break;
        await this.prisma.userDirectory.upsert({
          where: { userId: p.userId },
          create: { userId: p.userId, displayName: p.displayName },
          update: { displayName: p.displayName },
        });
        break;
      }

      case 'profile.updated': {
        const p = payload as unknown as ProfileUpdatedPayload;
        if (!p.userId || !p.displayName) break;
        await this.prisma.userDirectory.upsert({
          where: { userId: p.userId },
          create: { userId: p.userId, displayName: p.displayName },
          update: { displayName: p.displayName },
        });
        break;
      }

      default:
        this.logger.warn(`UserDirectoryConsumer: unhandled event type "${eventType}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
