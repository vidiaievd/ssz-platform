import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { Env } from '../../config/configuration.js';
import { CreateProfileHandler } from '../profiles/application/commands/create-profile/create-profile.handler.js';
import { PROFILE_REPOSITORY } from '../profiles/domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from '../profiles/infrastructure/persistence/profile.prisma.repository.js';
import { UserRegisteredConsumer } from '../profiles/infrastructure/events/user-registered.consumer.js';

@Module({
  imports: [CqrsModule],
  providers: [
    // Provide RABBITMQ_URL as an injectable string token
    {
      provide: 'RABBITMQ_URL',
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) =>
        config.get('RABBITMQ_URL') as string,
    },
    UserRegisteredConsumer,
    CreateProfileHandler,
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfilePrismaRepository,
    },
  ],
})
export class EventsModule {}
