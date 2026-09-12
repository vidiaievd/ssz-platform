import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { CourseOutlineService } from '../course-outline.service.js';

const PROCESSOR_ID = 'container-directory';
const QUEUE = 'analytics-service.projections.container-directory';
const EXCHANGE = EXCHANGES.CONTENT;

const BINDING_KEYS = [
  'content.container.created',
  'content.container.updated',
  'content.container.deleted',
  'content.container.archived',
  // Plan 58: the published outline is what "absorbed" is divided by, so it has to be
  // re-read the moment the course a group is taught from changes shape.
  'content.container.published',
] as const;

// content-service uses BaseEvent<ContainerCreatedPayload> — payload is the pure payload object.
interface ContainerCreatedPayload {
  containerId: string;
  containerType: string;
  title: string;
  ownerUserId: string;
  ownerSchoolId: string | null;
  visibility: string;
  targetLanguage: string;
}

interface ContainerUpdatedPayload {
  containerId: string;
  updatedFields: string[];
  title?: string;
}

interface ContainerDeletedPayload {
  containerId: string;
  ownerUserId: string;
}

interface ContainerPublishedPayload {
  containerId: string;
}

@Injectable()
export class ContainerDirectoryConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContainerDirectoryConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    private readonly courseOutline: CourseOutlineService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — ContainerDirectoryConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('ContainerDirectoryConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`ContainerDirectoryConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        // One at a time: a publish triggers an outline refresh that talks to another
        // service, and a batch handed over at once would run several of those against the
        // same rows.
        await channel.prefetch(1);
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`ContainerDirectoryConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      this.logger.error('ContainerDirectoryConsumer: non-JSON message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    if (!eventId || !eventType) {
      this.logger.warn('ContainerDirectoryConsumer: missing eventId/eventType — discarding');
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
      this.logger.debug(`ContainerDirectoryConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `ContainerDirectoryConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'content.container.created': {
        const p = payload as unknown as ContainerCreatedPayload;
        await this.prisma.containerDirectory.upsert({
          where: { containerId: p.containerId },
          create: {
            containerId: p.containerId,
            title: p.title,
            lang: p.targetLanguage,
            ownerUserId: p.ownerUserId,
            ownerSchoolId: p.ownerSchoolId ?? null,
            containerType: p.containerType,
            leafItemCount: 0,
          },
          update: {
            title: p.title,
            lang: p.targetLanguage,
            ownerUserId: p.ownerUserId,
            ownerSchoolId: p.ownerSchoolId ?? null,
            containerType: p.containerType,
          },
        });
        break;
      }

      case 'content.container.updated': {
        const p = payload as unknown as ContainerUpdatedPayload;
        if (p.title !== undefined) {
          await this.prisma.containerDirectory.updateMany({
            where: { containerId: p.containerId },
            data: { title: p.title },
          });
        }
        break;
      }

      case 'content.container.deleted': {
        const p = payload as unknown as ContainerDeletedPayload;
        await this.prisma.containerDirectory.updateMany({
          where: { containerId: p.containerId },
          data: { deletedAt: new Date() },
        });
        break;
      }

      case 'content.container.published': {
        const p = payload as unknown as ContainerPublishedPayload;
        await this.courseOutline.refresh(p.containerId);
        break;
      }

      case 'content.container.archived': {
        // archived containers stay visible for analytics (no soft-delete)
        break;
      }

      default:
        this.logger.warn(`ContainerDirectoryConsumer: unhandled event type "${eventType}"`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
