import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES, EXERCISE_ENGINE_EVENT_TYPES, type ExerciseAttemptRoutedForReviewPayload } from '@ssz/contracts';
import type { AppConfig } from '../../../../../config/configuration.js';
import { DraftReviewCommand } from '../../application/draft-review/draft-review.command.js';
import type { DraftReviewOutcome } from '../../application/draft-review/draft-review.handler.js';
import { DirectReviewCommand } from '../../../review-direct/application/direct-review/direct-review.command.js';
import type { DirectReviewOutcome } from '../../../review-direct/application/direct-review/direct-review.handler.js';
import { VoiceReviewCommand } from '../../../voice-review/application/voice-review/voice-review.command.js';
import type { VoiceReviewOutcome } from '../../../voice-review/application/voice-review/voice-review.handler.js';

const QUEUE = 'ai-service.review-draft.routed-for-review';
// Each message holds a model call of seconds; a few at once keeps the queue moving without
// sending a burst of submissions to a provider together.
const PREFETCH = 4;

/** Read by a speech model, not a language model (plan 82): its own command. */
const READ_ALOUD = 'read_aloud';

interface Envelope {
  eventId?: string;
  payload?: Partial<ExerciseAttemptRoutedForReviewPayload>;
}

/**
 * Plan 79: every submission routed for review. With a school behind it, it may get a
 * teacher's draft (step 1.3); without one, nobody but a model reads it, and it gets the
 * learner's own review with the verdict — or is closed as having no reviewer (step 2.2c).
 * A school that has a model answer first (`reviewAiMode`, plan 80) gets the learner's review
 * instead of the draft — the teacher's card shows the same one (step 3c). A reading aloud
 * goes to the voice review in both of those cases (plan 82, step 8); a teacher's draft of one
 * the engine refuses as a template without a prompt.
 *
 * No processed-events table: a second delivery finds the draft already on the attempt, or
 * the attempt decided (the engine answers `DRAFT_EXISTS` / `ATTEMPT_NOT_IN_REVIEW`), and asks
 * no model. A failure before any model call is retried once by redelivery; after the call
 * the handler retries the write itself.
 */
@Injectable()
export class RoutedForReviewConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutedForReviewConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — RoutedForReviewConsumer disabled; no review drafts');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('RoutedForReviewConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`RoutedForReviewConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGES.EXERCISE_ENGINE!, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGES.EXERCISE_ENGINE!, EXERCISE_ENGINE_EVENT_TYPES.ATTEMPT_ROUTED_FOR_REVIEW);
        await channel.prefetch(PREFETCH);
        await channel.consume(QUEUE, (msg) => void this.handle(channel, msg));
        this.logger.log(`RoutedForReviewConsumer listening on "${QUEUE}"`);
      },
    });
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: Envelope;
    let command: DraftReviewCommand | DirectReviewCommand | VoiceReviewCommand;
    try {
      envelope = JSON.parse(msg.content.toString()) as Envelope;
      const p = envelope.payload;
      if (!p || typeof p.attemptId !== 'string' || typeof p.userId !== 'string' || typeof p.templateCode !== 'string') {
        throw new Error('no attemptId, userId or templateCode');
      }
      const Ruling = p.templateCode === READ_ALOUD ? VoiceReviewCommand : DirectReviewCommand;
      command =
        typeof p.schoolId !== 'string'
          ? new Ruling(p.attemptId, p.userId, p.templateCode)
          : p.reviewAiMode
            ? new Ruling(p.attemptId, p.userId, p.templateCode, p.schoolId)
            : new DraftReviewCommand(p.attemptId, p.userId, p.templateCode, p.schoolId);
    } catch (err) {
      this.logger.error(`Malformed ${msg.fields.routingKey} — dropped: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, false);
      return;
    }

    try {
      const said =
        command instanceof DraftReviewCommand
          ? describe(await this.commandBus.execute<DraftReviewCommand, DraftReviewOutcome>(command))
          : command instanceof VoiceReviewCommand
            ? describeVoice(await this.commandBus.execute<VoiceReviewCommand, VoiceReviewOutcome>(command))
            : describeDirect(await this.commandBus.execute<DirectReviewCommand, DirectReviewOutcome>(command));
      this.logger.log(`Attempt ${command.attemptId} [${envelope.eventId ?? '?'}]: ${said}`);
      channel.ack(msg);
    } catch (err) {
      // Before any model call (the engine unreachable): one redelivery, then the submission
      // simply waits for its teacher without a draft — or, without a school, stays routed.
      this.logger.error(`Review of ${command.attemptId} failed: ${err instanceof Error ? err.message : String(err)}`);
      channel.nack(msg, false, !msg.fields.redelivered);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

function describe(outcome: DraftReviewOutcome): string {
  switch (outcome.kind) {
    case 'skipped':
      return `skipped (${outcome.reason})`;
    case 'not_called':
      return `no model called: ${outcome.outcome}${outcome.errorCode ? ` ${outcome.errorCode}` : ''} (call ${outcome.aiCallId})`;
    case 'written':
      return `draft ${outcome.status}, ${outcome.remarks} remark(s) (call ${outcome.aiCallId})`;
    case 'refused_by_engine':
      return `draft refused by exercise-engine: ${outcome.code} (call ${outcome.aiCallId})`;
    case 'write_failed':
      return `draft lost, exercise-engine unreachable (call ${outcome.aiCallId})`;
  }
}

function describeDirect(outcome: DirectReviewOutcome): string {
  switch (outcome.kind) {
    case 'skipped':
      return `learner's review skipped (${outcome.reason})`;
    case 'ruled':
      return (
        `learner's review written, ${outcome.remarks} remark(s), attempt ${outcome.attemptStatus}` +
        `${outcome.provisional ? ' (provisional, the teacher decides)' : ''} (call ${outcome.aiCallId})`
      );
    case 'gave_up':
      return (
        `no reviewer (${outcome.reason}: ${outcome.cause}), engine ${outcome.engine}` +
        (outcome.aiCallId ? ` (call ${outcome.aiCallId})` : '')
      );
    case 'left_to_teacher':
      return `no model's review (${outcome.cause}), the teacher reviews it` + (outcome.aiCallId ? ` (call ${outcome.aiCallId})` : '');
  }
}

function describeVoice(outcome: VoiceReviewOutcome): string {
  switch (outcome.kind) {
    case 'skipped':
      return `voice review skipped (${outcome.reason})`;
    case 'ruled':
      return (
        `reading heard (${outcome.capability}, ${outcome.aiCallIds.length} prompt(s)), attempt ${outcome.attemptStatus}` +
        `${outcome.provisional ? ' (provisional, the teacher decides)' : ''} (calls ${outcome.aiCallIds.join(', ')})`
      );
    case 'gave_up':
      return (
        `no reviewer for the reading (${outcome.reason}: ${outcome.cause}), engine ${outcome.engine}` +
        (outcome.aiCallId ? ` (call ${outcome.aiCallId})` : '')
      );
    case 'left_to_teacher':
      return `reading not heard (${outcome.cause}), the teacher listens to it` + (outcome.aiCallId ? ` (call ${outcome.aiCallId})` : '');
  }
}
