import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { Env } from '../../config/configuration.js';
import { CreateProfileHandler } from '../profiles/application/commands/create-profile/create-profile.handler.js';
import { PROFILE_REPOSITORY } from '../profiles/domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from '../profiles/infrastructure/persistence/profile.prisma.repository.js';
import { UserRegisteredConsumer } from '../profiles/infrastructure/events/user-registered.consumer.js';
import { UserDeletedConsumer } from '../profiles/infrastructure/events/user-deleted.consumer.js';
import { EraseUserDataHandler } from '../profiles/application/commands/erase-user-data/erase-user-data.handler.js';
import { USER_DATA_ERASER } from '../profiles/application/ports/user-data-eraser.interface.js';
import { UserDataPrismaEraser } from '../profiles/infrastructure/persistence/user-data.prisma.eraser.js';

@Module({
  imports: [CqrsModule],
  providers: [
    {
      provide: 'RABBITMQ_URL',
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) =>
        config.get('RABBITMQ_URL') as string,
    },
    UserRegisteredConsumer,
    UserDeletedConsumer,
    CreateProfileHandler,
    EraseUserDataHandler,
    {
      provide: USER_DATA_ERASER,
      useClass: UserDataPrismaEraser,
    },
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfilePrismaRepository,
    },
  ],
})
export class EventsModule {}
