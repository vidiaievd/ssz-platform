import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, SUBSCRIPTION_EVENT_TYPES, type EntitlementsChangedPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../../config/configuration.js';
import { ENTITLEMENT_PROJECTION, type IEntitlementProjection } from '../../application/ports/entitlement-projection.js';
import { BILLED_PAYER_TYPES, type BilledPayerType } from '../../domain/payer.js';
import { fromWire } from '../../infrastructure/entitlements-wire.mapper.js';

const QUEUE = 'ai-service.entitlements-changed';
// Each write is guarded by version, so order inside a batch does not matter.
const PREFETCH = 10;

interface Envelope {
  eventId?: string;
  payload?: Partial<EntitlementsChangedPayload>;
}

/**
 * Plan 78 §6: every `subscription.entitlements.changed` snapshot into `ai_payer_entitlements`.
 * No processed-events table: a snapshot is the whole truth at its version, and the
 * projection keeps the one that supersedes — a redelivery or a late event is a no-op.
 */
@Injectable()
export class EntitlementsChangedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EntitlementsChangedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    @Inject(ENTITLEMENT_PROJECTION) private readonly projection: IEntitlementProjection,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — EntitlementsChangedConsumer disabled; every check reads through');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('EntitlementsChangedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`EntitlementsChangedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.SUBSCRIPTION!, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.SUBSCRIPTION!, SUBSCRIPTION_EVENT_TYPES.ENTITLEMENTS_CHANGED);
        await channel.prefetch(PREFETCH);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`EntitlementsChangedConsumer listening on "${QUEUE}"`);
      },
    });
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: Envelope;
    let payer: { type: BilledPayerType; id: string };
    let snapshot: ReturnType<typeof fromWire>;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
      const account = envelope.payload?.account;
      if (!account || !isBilledType(account.type) || typeof account.externalId !== 'string') {
        throw new Error('no billed account');
      }
      payer = { type: account.type, id: account.externalId };
      snapshot = fromWire(envelope.payload);
    } catch (err) {
      this.logger.error(`Malformed ${msg.fields.routingKey} — dropped: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const stored = await this.projection.save(payer, snapshot);
      this.logger.log(
        `${payer.type} ${payer.id} v${snapshot.version} [${envelope.eventId ?? '?'}]: ${stored ? 'stored' : 'older than held — skipped'}`,
      );
      channel.ack(msg);
    } catch (err) {
      // One retry; after that the row is missing or stale, and the gate reads through.
      this.logger.error(`Failed to store entitlements of ${payer.type} ${payer.id}: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

function isBilledType(type: unknown): type is BilledPayerType {
  return (BILLED_PAYER_TYPES as readonly unknown[]).includes(type);
}
