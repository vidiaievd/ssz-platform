import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ExerciseAttemptStartedPayload } from '@ssz/contracts';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';
import { UpsertProgressCommand } from '../../progress/application/commands/upsert-progress.command.js';

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: unknown;
}

const QUEUE = 'learning-service.exercise-started';
const ROUTING_KEY = EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_STARTED;

/**
 * An attempt was opened on an exercise: the unit list shows it «in progress» (plan 90, Q18).
 *
 * Until now only a verdict (`exercise.attempt.completed`) moved an exercise's progress, so a
 * read_aloud with three takes in its draft — or any exercise opened and left — still read
 * «available», on the web and on the phone alike. The status is the engine's to give, through
 * its events (plan 76, 2.6); this is the event for the moment work begins.
 *
 * Only an untouched exercise moves (`UserProgress.recordStart`): a start reaching us after its
 * own verdict, from the other queue, changes nothing. A disposable probe keeps no progress row
 * (plan 63 phase 9), and an event that does not say whether it is one — an engine older than
 * this change — is left alone rather than guessed at.
 */
@Injectable()
export class ExerciseStartedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExerciseStartedConsumer.name);
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
      this.logger.warn('RABBITMQ_URL not configured — ExerciseStartedConsumer disabled');
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
        // One at a time: two starts of the same exercise in one batch would both read
        // «no row» and race to create it.
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => {
          if (msg) void this.handleMessage(channel, msg);
        });
        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${ROUTING_KEY}"`);
      },
    });
    // Without a listener an 'error' from the channel (a setup failing while the broker
    // restarts) is an unhandled event and takes the whole process down.
    this.channelWrapper.on('error', (err: unknown) =>
      this.logger.error(`RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage): Promise<void> {
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

      const p = payload as Partial<ExerciseAttemptStartedPayload>;
      if (p.ephemeral === false && typeof p.userId === 'string' && typeof p.exerciseId === 'string') {
        const result = await this.commandBus.execute(
          new UpsertProgressCommand(p.userId, 'EXERCISE', p.exerciseId, 0, null, false, undefined, 'started'),
        );
        if (result.isFail) {
          this.logger.warn(`Start progress failed for event ${eventId}: ${result.error?.message}`);
        }
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
