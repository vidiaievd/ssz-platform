import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { PROCESSED_EVENTS_REPOSITORY, type IProcessedEventsRepository } from '../../../../shared/application/ports/processed-events.repository.interface.js';
import { CreateTeachingProfileCommand } from '../../application/commands/create-teaching-profile/create-teaching-profile.command.js';
import { AddTeachingLanguageCommand } from '../../application/commands/add-teaching-language/add-teaching-language.command.js';
import { TeachingProfileAlreadyExistsException } from '../../domain/exceptions/teaching-profile-already-exists.exception.js';
import { TeachingLanguageAlreadyExistsException } from '../../domain/exceptions/teaching-language-already-exists.exception.js';
import { EXCHANGES } from '@ssz/contracts';

interface TeacherLanguagePayload {
  code: string;
  level?: string | null;
}

interface SchoolTeacherAcceptedPayload {
  userId: string;
  schoolId: string;
  languages: TeacherLanguagePayload[] | null;
}

interface SchoolTeacherAcceptedEnvelope {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: SchoolTeacherAcceptedPayload;
}

const EXCHANGE = EXCHANGES.ORGANIZATION;
const EXCHANGE_TYPE = 'topic';
const QUEUE = 'user_profile_service.school.teacher.accepted';
const ROUTING_KEY = 'school.teacher.accepted';

@Injectable()
export class SchoolTeacherAcceptedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchoolTeacherAcceptedConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;

  constructor(
    private readonly commandBus: CommandBus,
    @Inject(PROCESSED_EVENTS_REPOSITORY)
    private readonly processedEvents: IProcessedEventsRepository,
    @Inject('RABBITMQ_URL')
    private readonly rabbitmqUrl: string,
  ) {}

  onModuleInit(): void {
    this.connection = amqp.connect([this.rabbitmqUrl]);

    this.connection.on('connect', () => this.logger.log('RabbitMQ consumer connected'));
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ consumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    const channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
        await channel.prefetch(1);

        await channel.consume(QUEUE, (msg) => {
          void (async () => {
            if (!msg) return;

            let envelope: SchoolTeacherAcceptedEnvelope;
            try {
              envelope = JSON.parse(msg.content.toString()) as SchoolTeacherAcceptedEnvelope;
            } catch {
              this.logger.error('Failed to parse school.teacher.accepted — nacking');
              channel.nack(msg, false, false);
              return;
            }

            if (await this.processedEvents.isProcessed(envelope.eventId)) {
              this.logger.warn(`Duplicate event ignored: ${envelope.eventId}`);
              channel.ack(msg);
              return;
            }

            try {
              const { userId, languages } = envelope.payload;

              // Idempotent create — silently skip if profile already exists.
              try {
                await this.commandBus.execute(new CreateTeachingProfileCommand(userId));
              } catch (err) {
                if (!(err instanceof TeachingProfileAlreadyExistsException)) throw err;
              }

              // Materialize languages from invitation.
              if (Array.isArray(languages)) {
                for (const lang of languages) {
                  try {
                    await this.commandBus.execute(
                      new AddTeachingLanguageCommand(userId, lang.code, lang.level ?? undefined),
                    );
                  } catch (err) {
                    if (!(err instanceof TeachingLanguageAlreadyExistsException)) throw err;
                  }
                }
              }

              await this.processedEvents.markProcessed(envelope.eventId, envelope.eventType);
              channel.ack(msg);

              this.logger.log(`TeachingProfile materialized for userId: ${userId}`);
            } catch (err) {
              this.logger.error(
                `Failed to process event ${envelope.eventId}: ${err instanceof Error ? err.message : String(err)}`,
              );
              channel.nack(msg, false, false);
            }
          })();
        });

        this.logger.log(`Consumer ready — queue "${QUEUE}" bound to "${EXCHANGE}/${ROUTING_KEY}"`);
      },
    });

    channelWrapper.on('error', (err: Error) =>
      this.logger.error(`RabbitMQ channel error: ${err.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
