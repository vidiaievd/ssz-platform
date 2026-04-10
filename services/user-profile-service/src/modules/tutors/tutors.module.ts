import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PROFILE_REPOSITORY } from '../profiles/domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from '../profiles/infrastructure/persistence/profile.prisma.repository.js';
import { AddTeachingLanguageHandler } from './application/commands/add-teaching-language/add-teaching-language.handler.js';
import { CreateTutorProfileHandler } from './application/commands/create-tutor-profile/create-tutor-profile.handler.js';
import { RemoveTeachingLanguageHandler } from './application/commands/remove-teaching-language/remove-teaching-language.handler.js';
import { GetTutorProfileHandler } from './application/queries/get-tutor-profile/get-tutor-profile.handler.js';
import { TUTOR_PROFILE_REPOSITORY } from './domain/repositories/tutor-profile.repository.interface.js';
import { TutorProfilePrismaRepository } from './infrastructure/persistence/tutor-profile.prisma.repository.js';
import { TutorsController } from './presentation/controllers/tutors.controller.js';

const CommandHandlers = [
  CreateTutorProfileHandler,
  AddTeachingLanguageHandler,
  RemoveTeachingLanguageHandler,
];

const QueryHandlers = [GetTutorProfileHandler];

@Module({
  imports: [CqrsModule],
  controllers: [TutorsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    {
      provide: TUTOR_PROFILE_REPOSITORY,
      useClass: TutorProfilePrismaRepository,
    },
    // Profile repository needed to look up the base profile by userId in handlers
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfilePrismaRepository,
    },
  ],
})
export class TutorsModule {}
