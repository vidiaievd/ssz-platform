import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ExerciseFeedbackAtomsFlaggedPayload } from '@ssz/contracts';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';
import { ApplyFlaggedAtomsCommand } from '../../srs/application/commands/apply-flagged-atoms.command.js';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

const QUEUE = 'learning-service.atoms-flagged';
const ROUTING_KEY = EXERCISE_ENGINE_EVENT_TYPES.FEEDBACK_ATOMS_FLAGGED;

/**
 * Rule atoms a check of the learner's work named (plan 85, step 5) — see
 * `ApplyFlaggedAtomsHandler` for what is done with them. A letter without a learner or atoms
 * is dropped: there is nothing to apply it to.
 */
@Injectable()
export class AtomsFlaggedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AtomsFlaggedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AtomsFlaggedConsumer disabled');
      return;
    }
    const exchange = EXCHANGES.EXERCISE_ENGINE;

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(exchange, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, exchange, ROUTING_KEY);
        await channel.prefetch(10);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${ROUTING_KEY}"`);
      },
    });
  }

  async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('Malformed message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType, payload } = envelope;

    try {
      const existing = await this.prisma.processedEvent.findUnique({ where: { eventId } });
      if (existing) {
        this.logger.debug(`Duplicate event ${eventId} — skipping`);
        channel.ack(msg);
        return;
      }

      const p = payload as ExerciseFeedbackAtomsFlaggedPayload;
      if (typeof p?.userId === 'string' && Array.isArray(p.atoms) && p.atoms.length > 0) {
        await this.commandBus.execute(new ApplyFlaggedAtomsCommand(p));
      } else {
        this.logger.warn(`${eventType} [${eventId}] names no learner or atoms — dropped`);
      }

      await this.prisma.processedEvent.create({ data: { eventId, eventType } });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(
        `Error handling ${eventType} [${eventId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
      channel.nack(msg, false, false);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
