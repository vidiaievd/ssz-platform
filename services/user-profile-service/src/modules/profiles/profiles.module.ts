import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateProfileHandler } from './application/commands/create-profile/create-profile.handler.js';
import { DeleteProfileHandler } from './application/commands/delete-profile/delete-profile.handler.js';
import { UpdateProfileHandler } from './application/commands/update-profile/update-profile.handler.js';
import { GetProfileByUserIdHandler } from './application/queries/get-profile-by-user-id/get-profile-by-user-id.handler.js';
import { LookupUserByEmailHandler } from './application/queries/lookup-user-by-email/lookup-user-by-email.handler.js';
import { PROFILE_REPOSITORY } from './domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from './infrastructure/persistence/profile.prisma.repository.js';
import { GetStudentProfileByUserIdHandler } from '../students/application/queries/get-student-profile-by-user-id/get-student-profile-by-user-id.handler.js';
import { STUDENT_PROFILE_REPOSITORY } from '../students/domain/repositories/student-profile.repository.interface.js';
import { StudentProfilePrismaRepository } from '../students/infrastructure/persistence/student-profile.prisma.repository.js';
import { GetTutorProfileByUserIdHandler } from '../tutors/application/queries/get-tutor-profile-by-user-id/get-tutor-profile-by-user-id.handler.js';
import { ListTutorsHandler } from '../tutors/application/queries/list-tutors/list-tutors.handler.js';
import { TUTOR_PROFILE_REPOSITORY } from '../tutors/domain/repositories/tutor-profile.repository.interface.js';
import { TutorProfilePrismaRepository } from '../tutors/infrastructure/persistence/tutor-profile.prisma.repository.js';
import { TEACHING_PROFILE_REPOSITORY } from '../teaching/domain/repositories/teaching-profile.repository.interface.js';
import { TeachingProfilePrismaRepository } from '../teaching/infrastructure/persistence/teaching-profile.prisma.repository.js';
import { GetTeachingProfileByUserIdHandler } from '../teaching/application/queries/get-teaching-profile-by-user-id/get-teaching-profile-by-user-id.handler.js';
import { ProfilesController } from './presentation/controllers/profiles.controller.js';
import { PublicProfilesController } from './presentation/controllers/public-profiles.controller.js';
import { UsersLookupController } from './presentation/controllers/users-lookup.controller.js';

const CommandHandlers = [
  CreateProfileHandler,
  UpdateProfileHandler,
  DeleteProfileHandler,
];
const QueryHandlers = [
  GetProfileByUserIdHandler,
  GetStudentProfileByUserIdHandler,
  GetTutorProfileByUserIdHandler,
  GetTeachingProfileByUserIdHandler,
  ListTutorsHandler,
  LookupUserByEmailHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [ProfilesController, PublicProfilesController, UsersLookupController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfilePrismaRepository,
    },
    {
      provide: STUDENT_PROFILE_REPOSITORY,
      useClass: StudentProfilePrismaRepository,
    },
    {
      provide: TUTOR_PROFILE_REPOSITORY,
      useClass: TutorProfilePrismaRepository,
    },
    {
      provide: TEACHING_PROFILE_REPOSITORY,
      useClass: TeachingProfilePrismaRepository,
    },
  ],
})
export class ProfilesModule {}
