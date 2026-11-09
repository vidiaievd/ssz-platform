import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { ADMIN_EVENT_TYPES } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { ADMIN_AUDIT_SOURCES, adminAuditRowOf } from '../domain/admin-audit.js';
import type { AdminAuditRow } from '../domain/admin-audit.js';

const PROCESSOR_ID = 'admin-audit-log';
const QUEUE_PREFIX = 'analytics-service.admin-audit';
const ROUTING_KEY = ADMIN_EVENT_TYPES.ACTION_PERFORMED;

/**
 * Files every `admin.action.performed` into `admin_audit_log` — plan 90, phase 1, step 6.
 *
 * Each service publishes the same routing key on its own exchange, so there is one queue per
 * exchange (`analytics-service.admin-audit.<service>`), all on one channel taking one message at a
 * time per queue. The exchange names the service; the marker in `processed_events` and the row
 * share one transaction, so a redelivery files nothing twice.
 */
@Injectable()
export class AdminActionConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminActionConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AdminActionConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AdminActionConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AdminActionConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.prefetch(1);
        for (const [exchange, service] of Object.entries(ADMIN_AUDIT_SOURCES)) {
          const queue = `${QUEUE_PREFIX}.${service}`;
          await channel.assertExchange(exchange, 'topic', { durable: true });
          await channel.assertQueue(queue, { durable: true });
          await channel.bindQueue(queue, exchange, ROUTING_KEY);
          await channel.consume(queue, (msg) => this.handleMessage(channel, exchange, msg));
          this.logger.log(`AdminActionConsumer listening on queue "${queue}"`);
        }
      },
    });
  }

  async handleMessage(channel: ConfirmChannel, exchange: string, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: unknown;
    try {
      envelope = JSON.parse(msg.content.toString());
    } catch {
      this.logger.error(`AdminActionConsumer: non-JSON message on ${exchange} — discarding`);
      channel.nack(msg, false, false);
      return;
    }

    const row = adminAuditRowOf(exchange, envelope);
    if (!row) {
      const eventId = (envelope as { eventId?: unknown } | null)?.eventId;
      this.logger.warn(`AdminActionConsumer: discarding malformed admin action on ${exchange} [${String(eventId)}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const filed = await this.file(row);
      channel.ack(msg);
      this.logger.debug(`AdminActionConsumer: ${filed ? 'filed' : 'already filed'} ${row.action} [${row.id}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AdminActionConsumer: failed [${row.id}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was filed before. */
  private async file(row: AdminAuditRow): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId: row.id, processorId: PROCESSOR_ID, eventType: ROUTING_KEY }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      await tx.adminAuditLog.createMany({
        data: [
          {
            ...row,
            before: json(row.before),
            after: json(row.after),
          },
        ],
        skipDuplicates: true,
      });
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

function json(value: Record<string, unknown> | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}
