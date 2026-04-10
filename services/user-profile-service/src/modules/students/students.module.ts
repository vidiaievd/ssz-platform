import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PROFILE_REPOSITORY } from '../profiles/domain/repositories/profile.repository.interface.js';
import { ProfilePrismaRepository } from '../profiles/infrastructure/persistence/profile.prisma.repository.js';
import { AddTargetLanguageHandler } from './application/commands/add-target-language/add-target-language.handler.js';
import { CreateStudentProfileHandler } from './application/commands/create-student-profile/create-student-profile.handler.js';
import { RemoveTargetLanguageHandler } from './application/commands/remove-target-language/remove-target-language.handler.js';
import { GetStudentProfileHandler } from './application/queries/get-student-profile/get-student-profile.handler.js';
import { STUDENT_PROFILE_REPOSITORY } from './domain/repositories/student-profile.repository.interface.js';
import { StudentProfilePrismaRepository } from './infrastructure/persistence/student-profile.prisma.repository.js';
import { StudentsController } from './presentation/controllers/students.controller.js';

const CommandHandlers = [
  CreateStudentProfileHandler,
  AddTargetLanguageHandler,
  RemoveTargetLanguageHandler,
];

const QueryHandlers = [GetStudentProfileHandler];

@Module({
  imports: [CqrsModule],
  controllers: [StudentsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    {
      provide: STUDENT_PROFILE_REPOSITORY,
      useClass: StudentProfilePrismaRepository,
    },
    // Profile repository needed to look up the base profile by userId in handlers
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfilePrismaRepository,
    },
  ],
})
export class StudentsModule {}
