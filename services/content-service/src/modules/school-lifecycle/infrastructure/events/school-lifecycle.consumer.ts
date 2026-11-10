import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../../../config/configuration.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  ApplySchoolClosedCommand,
  ApplySchoolRestoredCommand,
  PurgeSchoolMaterialsCommand,
} from '../../application/commands/school-lifecycle.commands.js';

const PROCESSOR_ID = 'school-lifecycle';
const QUEUE = 'content-service.school-lifecycle';
const ROUTING_KEYS = [
  ORGANIZATION_EVENT_TYPES.SCHOOL_CLOSED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_RESTORED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_PURGED,
] as const;

interface EventEnvelope {
  eventId?: string;
  eventType?: string;
  payload?: { schoolId?: unknown; name?: unknown };
}

/**
 * A school's lifecycle reaches its materials (plan 90, phase 5, step 4b): `school.closed` →
 * courses `unmaintained`, `school.restored` → back to `maintained`, `school.purged` → what others
 * use stays (`obsolete`), the rest is deleted. One at a time (prefetch 1), in the order
 * organization's outbox sent them.
 */
@Injectable()
export class SchoolLifecycleConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolLifecycleConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null =
    null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolLifecycleConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolLifecycleConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SchoolLifecycleConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of ROUTING_KEYS) await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION, key);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handleMessage(channel, msg));
        this.logger.log(`SchoolLifecycleConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('SchoolLifecycleConsumer: non-JSON — discarding');
      channel.nack(msg, false, false);
      return;
    }

    // organization's routing key is the event's name, and so is its envelope's eventType.
    const eventType = envelope.eventType ?? msg.fields.routingKey;
    const eventId = envelope.eventId;
    const schoolId = envelope.payload?.schoolId;
    const name = typeof envelope.payload?.name === 'string' ? envelope.payload.name : '';
    if (
      !eventId ||
      typeof schoolId !== 'string' ||
      schoolId.length === 0 ||
      !isHandled(eventType)
    ) {
      this.logger.error(
        `SchoolLifecycleConsumer: malformed "${eventType}" [${eventId}] — discarding`,
      );
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

      await this.commandBus.execute(commandFor(eventType, schoolId, name));

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });
      channel.ack(msg);
    } catch (err) {
      // One retry: every command is safe to run again (a purge reads its graph afresh).
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `SchoolLifecycleConsumer: "${eventType}" for school ${schoolId} [${eventId}] failed: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

type HandledType = (typeof ROUTING_KEYS)[number];

function isHandled(eventType: string | undefined): eventType is HandledType {
  return (ROUTING_KEYS as readonly string[]).includes(eventType ?? '');
}

function commandFor(eventType: HandledType, schoolId: string, name: string) {
  switch (eventType) {
    case ORGANIZATION_EVENT_TYPES.SCHOOL_CLOSED:
      return new ApplySchoolClosedCommand(schoolId, name);
    case ORGANIZATION_EVENT_TYPES.SCHOOL_RESTORED:
      return new ApplySchoolRestoredCommand(schoolId);
    case ORGANIZATION_EVENT_TYPES.SCHOOL_PURGED:
      return new PurgeSchoolMaterialsCommand(schoolId, name);
  }
}
