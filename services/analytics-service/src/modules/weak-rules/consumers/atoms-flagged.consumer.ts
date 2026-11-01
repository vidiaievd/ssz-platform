import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES } from '@ssz/contracts';
import type { BaseEvent, ExerciseFeedbackAtomsFlaggedPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { flagRowsOf } from '../domain/weak-rules.js';
import type { FlagRow } from '../domain/weak-rules.js';

const PROCESSOR_ID = 'weak-rules-daily';
const QUEUE = 'analytics-service.weak-rules.atoms-flagged';
const EXCHANGE = EXCHANGES.EXERCISE_ENGINE;
const BINDING_KEY = EXERCISE_ENGINE_EVENT_TYPES.FEEDBACK_ATOMS_FLAGGED;

/**
 * Folds the rules checks named as the ground of a mistake into `weak_rules_daily` — plan 85,
 * step 10.
 *
 * Plan 85 §1 rule 3 holds here on its own: the row is keyed by (day, learner, exercise,
 * atom, source), so three rehearsals of one answer are one row. A repeat on the same day only
 * moves `flagged_at` forward. Marker and rows share one transaction and the channel takes one
 * message at a time (memory `rabbitmq-consumer-no-prefetch`).
 */
@Injectable()
export class AtomsFlaggedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AtomsFlaggedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — AtomsFlaggedConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('AtomsFlaggedConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`AtomsFlaggedConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, BINDING_KEY);
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`AtomsFlaggedConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    const rows = flagRowsOf(envelope.payload as Partial<ExerciseFeedbackAtomsFlaggedPayload> | undefined);
    if (!eventId || !eventType || rows === null) {
      this.logger.warn(`AtomsFlaggedConsumer: discarding malformed "${eventType}" [${eventId}]`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const folded = await this.fold(eventId, eventType, rows);
      channel.ack(msg);
      this.logger.debug(`AtomsFlaggedConsumer: ${folded ? 'folded' : 'already folded'} [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `AtomsFlaggedConsumer: failed [${eventId}]: ${String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  /** False when this event was folded before. */
  private async fold(eventId: string, eventType: string, rows: FlagRow[]): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.processedEvent.createMany({
        data: [{ eventId, processorId: PROCESSOR_ID, eventType }],
        skipDuplicates: true,
      });
      if (marked.count === 0) return false;

      for (const row of rows) {
        // A repeat on the same day is the same signal: only the latest time moves, and a
        // late event never rewinds it.
        await tx.$executeRaw`
          INSERT INTO weak_rules_daily (
            id, day, user_id, exercise_id, atom_type, atom_id, source,
            school_id, group_id, container_id, in_exercise_targets, flagged_at
          ) VALUES (
            gen_random_uuid()::text, ${row.day}::date, ${row.userId}, ${row.exerciseId}, ${row.atomType},
            ${row.atomId}, ${row.source}, ${row.schoolId}, ${row.groupId}, ${row.containerId},
            ${row.inExerciseTargets}, ${row.flaggedAt}
          )
          ON CONFLICT (day, user_id, exercise_id, atom_type, atom_id, source)
          DO UPDATE SET flagged_at = GREATEST(weak_rules_daily.flagged_at, EXCLUDED.flagged_at)`;
      }
      return true;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
