import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { RabbitMQService } from '../../../infrastructure/messaging/rabbitmq.service';
import { ProfilesService } from '../../profiles/profiles.service';

interface UserRegisteredPayload {
  userId: string;
  email: string;
  role: string;
  timestamp: string;
  // The Auth Service sets a unique messageId per event
  eventId?: string;
}

@Injectable()
export class UserRegisteredConsumer implements OnModuleInit {
  private readonly logger = new Logger(UserRegisteredConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly profilesService: ProfilesService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const queue = this.configService.get<string>('rabbitmq.queue') as string;
    const exchange = this.configService.get<string>('rabbitmq.exchangeUsers') as string;

    await this.rabbitMQService.consume(
      queue,
      exchange,
      ['user.registered', 'user.deleted'],
      this.handleMessage.bind(this),
    );
  }

  private async handleMessage(
    payload: Record<string, unknown>,
    eventId: string,
  ): Promise<void> {
    const routingKey = (payload['_routingKey'] as string) || '';

    if (routingKey === 'user.deleted') {
      await this.handleUserDeleted(payload as unknown as { userId: string }, eventId);
    } else {
      await this.handleUserRegistered(payload as unknown as UserRegisteredPayload, eventId);
    }
  }

  private async handleUserRegistered(
    payload: UserRegisteredPayload,
    eventId: string,
  ): Promise<void> {
    const { userId, email, role } = payload;

    if (!userId || !email || !role) {
      this.logger.warn('user.registered: missing required fields, skipping', payload);
      return;
    }

    // Idempotency check — skip if this event was already processed
    const alreadyProcessed = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });

    if (alreadyProcessed) {
      this.logger.debug(`user.registered [${eventId}] already processed, skipping`);
      return;
    }

    this.logger.log(`Processing user.registered for userId=${userId}`);

    await this.profilesService.createFromEvent(userId, email, role);

    // Mark event as processed inside a transaction so we never create a duplicate profile
    await this.prisma.processedEvent.create({
      data: {
        eventId,
        eventType: 'user.registered',
      },
    });

    this.logger.log(`Profile created for userId=${userId}`);
  }

  private async handleUserDeleted(
    payload: { userId: string },
    eventId: string,
  ): Promise<void> {
    const { userId } = payload;

    if (!userId) {
      this.logger.warn('user.deleted: missing userId, skipping');
      return;
    }

    const alreadyProcessed = await this.prisma.processedEvent.findUnique({
      where: { eventId },
    });

    if (alreadyProcessed) {
      this.logger.debug(`user.deleted [${eventId}] already processed, skipping`);
      return;
    }

    this.logger.log(`Processing user.deleted for userId=${userId}`);

    await this.profilesService.softDeleteByUserId(userId);

    await this.prisma.processedEvent.create({
      data: {
        eventId,
        eventType: 'user.deleted',
      },
    });

    this.logger.log(`Profile soft-deleted for userId=${userId}`);
  }
}
