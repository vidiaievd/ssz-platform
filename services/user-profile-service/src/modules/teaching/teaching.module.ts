import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import type { Env } from '../../config/configuration.js';
import { PROFILE_REPOSITORY } from '../profiles/domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from '../profiles/infrastructure/persistence/profile.prisma.repository.js';
import { TEACHING_PROFILE_REPOSITORY } from './domain/repositories/teaching-profile.repository.interface.js';
import { TeachingProfilePrismaRepository } from './infrastructure/persistence/teaching-profile.prisma.repository.js';
import { CreateTeachingProfileHandler } from './application/commands/create-teaching-profile/create-teaching-profile.handler.js';
import { AddTeachingLanguageHandler } from './application/commands/add-teaching-language/add-teaching-language.handler.js';
import { RemoveTeachingLanguageHandler } from './application/commands/remove-teaching-language/remove-teaching-language.handler.js';
import { GetTeachingProfileHandler } from './application/queries/get-teaching-profile/get-teaching-profile.handler.js';
import { GetTeachingProfileByUserIdHandler } from './application/queries/get-teaching-profile-by-user-id/get-teaching-profile-by-user-id.handler.js';
import { TeachingProfilesController } from './presentation/controllers/teaching-profiles.controller.js';
import { SchoolTeacherAcceptedConsumer } from './infrastructure/events/school-teacher-accepted.consumer.js';

const CommandHandlers = [
  CreateTeachingProfileHandler,
  AddTeachingLanguageHandler,
  RemoveTeachingLanguageHandler,
];

const QueryHandlers = [
  GetTeachingProfileHandler,
  GetTeachingProfileByUserIdHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [TeachingProfilesController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    { provide: TEACHING_PROFILE_REPOSITORY, useClass: TeachingProfilePrismaRepository },
    { provide: PROFILE_REPOSITORY, useClass: ProfilePrismaRepository },
    SchoolTeacherAcceptedConsumer,
    {
      provide: 'RABBITMQ_URL',
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env>) => config.get('RABBITMQ_URL') as string,
    },
  ],
  exports: [TEACHING_PROFILE_REPOSITORY],
})
export class TeachingModule {}
