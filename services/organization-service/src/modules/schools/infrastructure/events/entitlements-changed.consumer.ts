import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, SUBSCRIPTION_EVENT_TYPES } from '@ssz/contracts';
import type { EntitlementsChangedPayload } from '@ssz/contracts';
import {
  SEAT_LIMIT_PROJECTION,
  type ISeatLimitProjection,
  type SeatLimitSnapshot,
} from '../../../../shared/application/ports/seat-limit.interface.js';
import { studentSeatLimitOf } from '../../domain/value-objects/seat-limit.vo.js';
import type { Env } from '../../../../config/configuration.js';

const EXCHANGE = EXCHANGES.SUBSCRIPTION!;
const QUEUE = 'organization_service.subscription.entitlements_changed';
const ROUTING_KEY = SUBSCRIPTION_EVENT_TYPES.ENTITLEMENTS_CHANGED;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What one message means here: a school's seat limit, or nothing (a learner's own plan). */
export type SeatLimitMessage = { kind: 'school'; schoolId: string; snapshot: SeatLimitSnapshot } | { kind: 'ignored' };

/**
 * Reads a `subscription.entitlements.changed` envelope. Throws on a message that cannot be a
 * snapshot — it is dropped, not retried.
 */
export function parseSeatLimitMessage(content: string): SeatLimitMessage {
  const envelope = JSON.parse(content) as { payload?: Partial<EntitlementsChangedPayload> };
  const p = envelope.payload;
  if (!p?.account || typeof p.account.externalId !== 'string') throw new Error('no account');
  if (p.account.type !== 'workspace') return { kind: 'ignored' };
  if (!UUID.test(p.account.externalId)) throw new Error(`workspace id is not a UUID: ${p.account.externalId}`);
  const validUntil = typeof p.validUntil === 'string' ? new Date(p.validUntil) : null;
  if (typeof p.version !== 'number' || !validUntil || Number.isNaN(validUntil.getTime())) {
    throw new Error('no version / validUntil');
  }
  return {
    kind: 'school',
    schoolId: p.account.externalId,
    snapshot: { max: studentSeatLimitOf(p.features), version: p.version, validUntil },
  };
}

/**
 * Plan 90, phase 4: keeps `school_seat_limits` up to date from subscription-service's full
 * snapshots. Idempotent by the snapshot's version (an older or repeated one is not stored), so
 * no `processed_events` row per message. Malformed → dropped; a DB failure → one retry.
 */
@Injectable()
export class EntitlementsChangedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EntitlementsChangedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    @Inject(SEAT_LIMIT_PROJECTION) private readonly projection: ISeatLimitProjection,
    private readonly config: ConfigService<Env>,
  ) {}

  onModuleInit(): void {
    const rabbitmqUrl = this.config.get('RABBITMQ_URL') as string;
    if (!rabbitmqUrl) {
      this.logger.warn('RABBITMQ_URL not configured — EntitlementsChangedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([rabbitmqUrl]);
    this.connection.on('connect', () => this.logger.log(`RabbitMQ consumer connected (${ROUTING_KEY})`));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        // One at a time: two snapshots of one school must not race past the version check.
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/${ROUTING_KEY}"`);
      },
    });

    channelWrapper.on('error', (err: Error) => this.logger.error(`RabbitMQ channel error: ${err.message}`));
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let parsed: SeatLimitMessage;
    try {
      parsed = parseSeatLimitMessage(msg.content.toString());
    } catch (err) {
      this.logger.error(`Malformed ${ROUTING_KEY} — dropped: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, false);
      return;
    }
    if (parsed.kind === 'ignored') {
      channel.ack(msg);
      return;
    }

    try {
      const stored = await this.projection.save(parsed.schoolId, parsed.snapshot);
      if (stored) {
        this.logger.debug(`Seat limit of ${parsed.schoolId}: ${parsed.snapshot.max ?? 'none'} (v${parsed.snapshot.version})`);
      }
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Seat limit of ${parsed.schoolId} not stored: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
