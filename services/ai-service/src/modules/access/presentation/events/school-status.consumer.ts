import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, ORGANIZATION_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../../../config/configuration.js';
import { WORKSPACE_STATUS_STORE, type IWorkspaceStatusStore } from '../../application/ports/workspace-status.js';
import { statusAfterEvent } from '../../domain/workspace-status.js';

const QUEUE = 'ai-service.school-status';

const ROUTING_KEYS = [
  ORGANIZATION_EVENT_TYPES.SCHOOL_SUSPENDED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_REACTIVATED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_CLOSED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_RESTORED,
  ORGANIZATION_EVENT_TYPES.SCHOOL_PURGED,
];

interface Envelope {
  eventId?: string;
  occurredAt?: string;
  payload?: { schoolId?: unknown };
}

/**
 * Plan 90, phase 5, step 6: the lifecycle of a school into `payer_workspace_status`, so the gate can
 * refuse a school that is not `active`. No processed-events table: a status is the whole truth at
 * its moment and the store keeps the later one, so a redelivery or a late event is a no-op.
 * Dispatch is on the routing key (organization's envelope names the event in `eventType` too, but
 * the key is the contract).
 */
@Injectable()
export class SchoolStatusConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolStatusConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    @Inject(WORKSPACE_STATUS_STORE) private readonly store: IWorkspaceStatusStore,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — SchoolStatusConsumer disabled; every school counts as active');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('SchoolStatusConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`SchoolStatusConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION!, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of ROUTING_KEYS) await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION!, key);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`SchoolStatusConsumer listening on "${QUEUE}"`);
      },
    });
  }

  async handle(channel: Pick<ConfirmChannel, 'ack' | 'nack'>, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
    } catch {
      this.logger.error('Unparseable school event — dropped');
      channel.nack(msg, false, false);
      return;
    }
    const routingKey = msg.fields.routingKey;
    const status = statusAfterEvent(routingKey);
    const schoolId = envelope.payload?.schoolId;
    const at = envelope.occurredAt ? new Date(envelope.occurredAt) : null;
    if (!status || typeof schoolId !== 'string' || schoolId.length === 0 || !at || Number.isNaN(at.getTime())) {
      this.logger.error(`Malformed ${routingKey} [${envelope.eventId ?? '?'}] — dropped`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const stored = await this.store.save(schoolId, status, at);
      this.logger.log(`${routingKey} school ${schoolId} → ${status}: ${stored ? 'stored' : 'older than held — skipped'}`);
      channel.ack(msg);
    } catch (err) {
      // One retry; after that the school stays as the last event left it.
      this.logger.error(`Failed ${routingKey} for school ${schoolId}: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
