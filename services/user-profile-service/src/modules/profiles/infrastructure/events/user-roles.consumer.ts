import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { AUTH_EVENT_TYPES, EXCHANGES } from '@ssz/contracts';
import type { UserRoleChangedPayload } from '@ssz/contracts';
import type { IProcessedEventsRepository } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { PROCESSED_EVENTS_REPOSITORY } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

const EXCHANGE = EXCHANGES.AUTH;
const QUEUE = 'user_profile_service.auth.user_roles';
const ROUTING_KEYS = [
  AUTH_EVENT_TYPES.USER_ROLE_ASSIGNED,
  AUTH_EVENT_TYPES.USER_ROLE_REMOVED,
] as const;

interface Envelope {
  eventId?: string;
  payload?: Partial<UserRoleChangedPayload>;
}

/**
 * Keeps the roles of the `user_email_index` lookup copy in step with auth (plan 90, session 16
 * remark 2): registration writes the first set, and every later change comes as one role added or
 * taken away — a tutor who accepts a school's student invitation becomes `student` too.
 *
 * Only an existing row is touched. A row is born from `auth.user.registered`, which carries the
 * whole set; a role event that overtakes it would only repeat what it brings. Adding is a set
 * union and removing a set difference, so a redelivered or reordered pair ends the same way.
 */
@Injectable()
export class UserRolesConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserRolesConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    @Inject('RABBITMQ_URL')
    private readonly rabbitmqUrl: string,
  ) {}

  onModuleInit(): void {
    this.connection = amqp.connect([this.rabbitmqUrl]);
    this.connection.on('connect', () =>
      this.logger.log('RabbitMQ consumer connected (auth.user.role_*)'),
    );
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(
        `RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`,
      ),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of ROUTING_KEYS)
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handle(channel, msg);
        });
        this.logger.log(
          `Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/${ROUTING_KEYS.join(', ')}"`,
        );
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  async handle(
    channel: Pick<ConfirmChannel, 'ack' | 'nack'>,
    msg: ConsumeMessage,
  ): Promise<void> {
    let envelope: Envelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
    } catch {
      this.logger.error('Failed to parse a role event — dropped');
      channel.nack(msg, false, false);
      return;
    }

    // Auth's `eventType` is its C# type name; the routing key names the event.
    const key = msg.fields.routingKey;
    const userId = envelope.payload?.userId;
    const role = envelope.payload?.role?.trim().toLowerCase();
    if (
      !envelope.eventId ||
      !userId ||
      !role ||
      !(ROUTING_KEYS as readonly string[]).includes(key)
    ) {
      this.logger.error(`Malformed ${key} [${String(envelope.eventId)}] — dropped`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      if (await this.processedEvents.isProcessed(envelope.eventId)) {
        channel.ack(msg);
        return;
      }

      const changed =
        key === AUTH_EVENT_TYPES.USER_ROLE_ASSIGNED
          ? await this.prisma.$executeRaw`
              UPDATE user_email_index
                 SET roles = array_append(roles, ${role}), updated_at = now()
               WHERE user_id = ${userId} AND NOT (${role} = ANY(roles))`
          : await this.prisma.$executeRaw`
              UPDATE user_email_index
                 SET roles = array_remove(roles, ${role}), updated_at = now()
               WHERE user_id = ${userId} AND ${role} = ANY(roles)`;

      await this.processedEvents.markProcessed(envelope.eventId, key);
      channel.ack(msg);
      this.logger.log(
        `${key}: ${role} for ${userId} — ${changed > 0 ? 'lookup roles updated' : 'nothing to change'}`,
      );
    } catch (err) {
      // One retry; both statements are idempotent.
      this.logger.error(
        `Failed to apply ${key} for ${userId} [${envelope.eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
