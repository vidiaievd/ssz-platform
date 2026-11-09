import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  AUTH_EVENT_TYPES,
  EXCHANGES,
  ORGANIZATION_EVENT_TYPES,
  type SchoolCreatedPayload,
  type UserDeletedPayload,
  type UserRegisteredPayload,
} from '@ssz/contracts';
import type { AppConfig } from '../../../../config/configuration.js';
import { PROCESSED_EVENTS, type IProcessedEvents } from '../../../../shared/application/ports/processed-events.js';
import { OpenAccountCommand } from '../../application/commands/open-account/open-account.command.js';
import { CloseUserAccountCommand } from '../../application/commands/close-user-account/close-user-account.command.js';

const QUEUE = 'subscription-service.payer-created';
const STUDENT_ROLE = 'student';

interface Envelope {
  eventId?: string;
  payload?: unknown;
}

/**
 * Plan 78 §5: a payer appearing elsewhere opens its account here. `school.created` covers
 * SOLO workspaces too (organization-service provisions one per registering tutor), so a
 * tutor needs no `user` account; a registering student gets one for their own learning.
 *
 * `auth.user.deleted` (VoxOrd plan 07, step 3c) closes the learner's account on the same queue,
 * so a registration and a deletion of one user are never handled out of order.
 */
@Injectable()
export class PayerCreatedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PayerCreatedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly commands: CommandBus,
    @Inject(PROCESSED_EVENTS) private readonly processed: IProcessedEvents,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — PayerCreatedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('PayerCreatedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`PayerCreatedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.ORGANIZATION!, 'topic', { durable: true });
        await channel.assertExchange(EXCHANGES.AUTH!, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.ORGANIZATION!, ORGANIZATION_EVENT_TYPES.SCHOOL_CREATED);
        await channel.bindQueue(QUEUE, EXCHANGES.AUTH!, AUTH_EVENT_TYPES.USER_REGISTERED);
        await channel.bindQueue(QUEUE, EXCHANGES.AUTH!, AUTH_EVENT_TYPES.USER_DELETED);
        // One at a time: two events for one payer must not race each other's account write.
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`PayerCreatedConsumer listening on "${QUEUE}"`);
      },
    });
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
    } catch {
      this.logger.error('Unparseable message — dropped');
      channel.nack(msg, false, false);
      return;
    }
    // Dispatch on the routing key, not the envelope: auth-service writes its C# type name
    // into `eventType` ("IDomainEvent" for a registration), never the event's wire name.
    const eventType = msg.fields.routingKey;
    const { eventId } = envelope;
    if (!eventId) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.processed.isProcessed(eventId)) {
        channel.ack(msg);
        return;
      }
      const command = this.toCommand(eventType, envelope.payload);
      if (command) {
        const outcome = await this.commands.execute<OpenAccountCommand | CloseUserAccountCommand, string>(command);
        this.logger.log(`${eventType} [${eventId}] → ${command.type} ${command.externalId}: ${outcome}`);
      }
      await this.processed.markProcessed(eventId, eventType);
      channel.ack(msg);
    } catch (err) {
      // One retry; after that the payer simply has no account row yet, which resolves to
      // the free plan anyway — nothing is lost but the pinned plan version. A deletion that
      // fails twice leaves a deleted learner's subscription open: logged, nobody can use it.
      this.logger.error(`Failed ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  private toCommand(eventType: string, payload: unknown): OpenAccountCommand | CloseUserAccountCommand | null {
    if (eventType === ORGANIZATION_EVENT_TYPES.SCHOOL_CREATED) {
      const { schoolId } = (payload ?? {}) as Partial<SchoolCreatedPayload>;
      return schoolId ? new OpenAccountCommand('workspace', schoolId) : null;
    }
    if (eventType === AUTH_EVENT_TYPES.USER_REGISTERED) {
      const { userId, roles } = (payload ?? {}) as Partial<UserRegisteredPayload>;
      if (!userId || !Array.isArray(roles)) return null;
      return roles.some((r) => r.toLowerCase() === STUDENT_ROLE) ? new OpenAccountCommand('user', userId) : null;
    }
    if (eventType === AUTH_EVENT_TYPES.USER_DELETED) {
      const { userId } = (payload ?? {}) as Partial<UserDeletedPayload>;
      return userId ? new CloseUserAccountCommand(userId) : null;
    }
    return null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
