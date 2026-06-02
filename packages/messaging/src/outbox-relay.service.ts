import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { OUTBOX_STORE, type IOutboxStore } from './outbox.types.js';

export const OUTBOX_RELAY_OPTIONS = Symbol('OUTBOX_RELAY_OPTIONS');

export interface OutboxRelayOptions {
  /** RabbitMQ connection URL. */
  rabbitmqUrl: string;
  /** How often to poll the outbox table (ms). Default: 1000. */
  pollIntervalMs?: number;
  /** Max rows per poll batch. Default: 50. */
  batchSize?: number;
  /** Max delivery attempts before a row is abandoned. Default: 5. */
  maxAttempts?: number;
}

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;
  private timer: NodeJS.Timeout | null = null;

  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: IOutboxStore,
    @Optional() @Inject(OUTBOX_RELAY_OPTIONS) options: OutboxRelayOptions | null,
  ) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 1_000;
    this.batchSize = options?.batchSize ?? 50;
    this.maxAttempts = options?.maxAttempts ?? 5;

    const url = options?.rabbitmqUrl;
    if (!url) {
      this.logger.warn('No rabbitmqUrl provided to OutboxRelayService — relay disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('OutboxRelay: RabbitMQ connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`OutboxRelay: RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        // Exchanges are asserted by publishers — relay only needs a ready channel.
        this.logger.log('OutboxRelay: channel ready');
        void channel; // suppress unused warning
      },
    });
  }

  onModuleInit(): void {
    if (!this.channelWrapper) return;
    this.timer = setInterval(() => void this.flush(), this.pollIntervalMs);
    this.logger.log(`OutboxRelay started (poll every ${this.pollIntervalMs}ms, batch ${this.batchSize})`);
  }

  private async flush(): Promise<void> {
    if (!this.channelWrapper) return;

    let rows;
    try {
      rows = await this.store.fetchPending(this.batchSize);
    } catch (err) {
      this.logger.error(`OutboxRelay: failed to fetch pending rows: ${String(err)}`);
      return;
    }

    for (const row of rows) {
      if (row.attempts >= this.maxAttempts) {
        this.logger.error(
          `OutboxRelay: abandoning "${row.eventType}" [${row.eventId}] after ${row.attempts} attempts`,
        );
        // Mark published to remove from polling — a dead-letter strategy can be added later.
        await this.store.markPublished(row.id).catch(() => {});
        continue;
      }

      try {
        const body = Buffer.from(row.payload);

        await this.channelWrapper.publish(row.exchange, row.routingKey, body, {
          contentType: 'application/json',
          persistent: true,
          messageId: row.eventId,
          timestamp: Math.floor(row.occurredAt.getTime() / 1000),
          headers: {
            'x-event-type': row.eventType,
            'x-correlation-id': row.correlationId ?? '',
          },
        });

        await this.store.markPublished(row.id);
        this.logger.debug(`OutboxRelay: published "${row.eventType}" [${row.eventId}]`);
      } catch (err) {
        await this.store.incrementAttempts(row.id).catch(() => {});
        this.logger.warn(
          `OutboxRelay: transient failure for "${row.eventType}" [${row.eventId}]: ${String(err)}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
